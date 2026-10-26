const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Inspect embedded data without executing any JavaScript from the HTML.
const sourcePath = path.resolve(__dirname, '..', 'krakow-all-in-one.html');
const source = fs.readFileSync(sourcePath);
const bundleMatch = source.toString('utf8').match(
  /<script type="application\/json" id="bundled-pages">([\s\S]*?)<\/script>/,
);
if (!bundleMatch) throw new Error('Embedded page bundle was not found.');

const bundle = JSON.parse(bundleMatch[1]);
const pages = Object.fromEntries(
  Object.entries(bundle).map(([key, value]) => [
    key,
    Buffer.from(value, 'base64').toString('utf8'),
  ]),
);
const extraMatch = pages.mockups.match(
  /<script type="application\/json" id="extra-data">([\s\S]*?)<\/script>/,
);
if (!extraMatch) throw new Error('Embedded extra-data was not found.');
const data = JSON.parse(extraMatch[1]);
const roofs = data.r4.roofs;
if (!Array.isArray(roofs) || roofs.length === 0) {
  throw new Error('The reference roof dataset is empty or missing.');
}
for (const row of roofs) {
  if (
    !Array.isArray(row) || row.length !== 8 ||
    !row.slice(0, 6).every(Number.isFinite) ||
    typeof row[6] !== 'string' || typeof row[7] !== 'string'
  ) throw new Error('Unexpected reference roof row schema.');
}

const irradiation = roofs.reduce((sum, row) => sum + row[2], 0);
const top50 = roofs.slice().sort((a, b) => b[2] - a[2]).slice(0, 50);
const report = {
  source: path.basename(sourcePath),
  sourceBytes: source.length,
  sha256: crypto.createHash('sha256').update(source).digest('hex'),
  pages: Object.fromEntries(Object.entries(pages).map(([key, html]) => [
    key,
    { decodedBytes: Buffer.byteLength(html), title: html.match(/<title>(.*?)<\/title>/s)?.[1] },
  ])),
  referenceDataset: {
    rows: roofs.length,
    uniqueBuildingIds: new Set(roofs.map(row => row[7])).size,
    greenRoofFlag: roofs.filter(row => row[5]).length,
    investmentLabel: roofs.filter(row => row[6]).length,
    zeroOrNegativeArea: roofs.filter(row => row[4] <= 0).length,
    totalIrradiationKwhAsUsedByMockup: irradiation,
    electricityMwhAtMockup15Percent: irradiation * 0.15 / 1000,
    top50IrradiationShare: top50.reduce((sum, row) => sum + row[2], 0) / irradiation,
    aggregateRoofsAllField: data.r4.roofsAll,
    rowSchemaInferredFromRenderingCode: [
      'svgX', 'svgY', 'annualIrradiationKwh', 'irradiationKwhPerM2',
      'usableAreaM2', 'greenRoofFlag', 'investmentLabel', 'buildingId',
    ],
  },
  limitations: [
    'Counts describe the embedded snapshot, not a fresh MSIP download.',
    'SVG coordinates cannot be treated as geographic coordinates.',
    'Municipal parcel intersection does not verify building ownership or management.',
    'An investment label does not prove that photovoltaic panels are installed.',
    'The 15 percent conversion is a mockup assumption, not validated production.',
  ],
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
