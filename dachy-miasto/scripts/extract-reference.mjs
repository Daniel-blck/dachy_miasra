import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = await fs.readFile(new URL('../krakow-all-in-one.html', root));
const match = source.toString('utf8').match(/id="bundled-pages">([\s\S]*?)<\/script>/);
if (!match) throw new Error('Missing bundled-pages.');
const pages = JSON.parse(match[1]);
const html = Buffer.from(pages.mockups, 'base64').toString('utf8');
const extra = html.match(/id="extra-data">([\s\S]*?)<\/script>/);
if (!extra) throw new Error('Missing extra-data.');
const reference = JSON.parse(extra[1]).r4;
const roofs = reference.roofs.map(row => {
  if (row.length !== 8 || !row.slice(0, 6).every(Number.isFinite) || row[4] <= 0) {
    throw new Error('Invalid reference row.');
  }
  return {
    id: row[7],
    schematic: { x: row[0], y: row[1] },
    annualIrradiationKwh: row[2],
    averageIrradiationKwhM2: row[3],
    usableAreaM2: row[4],
    greenRoofPotential: Boolean(row[5]),
    investmentLabel: row[6] || null,
    ownershipStatus: 'unverified',
    protectionStatus: 'unknown',
    address: null,
  };
});
if (new Set(roofs.map(r => r.id)).size !== roofs.length) throw new Error('Duplicate building IDs.');
const metadata = {
  schemaVersion: 1,
  label: 'Pilotaż · dachy z pakietu badawczego',
  referenceFile: 'krakow-all-in-one.html',
  referenceSha256: createHash('sha256').update(source).digest('hex'),
  snapshotDate: null,
  records: roofs.length,
  greenRoofPotential: roofs.filter(r => r.greenRoofPotential).length,
  investmentLabels: roofs.filter(r => r.investmentLabel).length,
  geographicCoordinatesInReference: false,
  ownershipVerified: false,
  sources: [
    { name: 'MONIT-AIR · potencjał solarny dachów', url: 'https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer/0', role: 'Promieniowanie i powierzchnia; serwis opisany jako Atlas 2016.' },
    { name: 'MSIP Kraków', url: 'https://msip.krakow.pl/', role: 'Pochodzenie przypisania do działek publicznych w makiecie; przypisanie niezweryfikowane.' },
    { name: 'Miejskie inwestycje proklimatyczne', url: 'https://msip.krakow.pl/dataset/2261', role: 'Etykiety inwestycji z makiety; nie potwierdzają obecności PV.' },
  ],
};
await fs.mkdir(new URL('data/', root), { recursive: true });
await fs.writeFile(new URL('data/roofs.json', root), JSON.stringify(roofs));
await fs.writeFile(new URL('data/reference-metadata.json', root), JSON.stringify(metadata, null, 2) + '\n');
console.log(`Extracted ${roofs.length} unique roofs into ${fileURLToPath(new URL('data/', root))}`);
