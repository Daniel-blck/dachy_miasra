import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const destination = new URL('../vendor/leaflet/', import.meta.url);
const base = 'https://unpkg.com/leaflet@1.9.4/';
const files = ['dist/leaflet.js', 'dist/leaflet.css', 'dist/leaflet.js.map', 'LICENSE',
  ...['layers.png', 'layers-2x.png', 'marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png'].map(f => `dist/images/${f}`)];
const expected = {
  'dist/leaflet.js': '20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  'dist/leaflet.css': 'p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
const manifest = { name: 'Leaflet', version: '1.9.4', license: 'BSD-2-Clause', source: base, files: {} };
for (const file of files) {
  const response = await fetch(base + file, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${file}`);
  const content = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(content).digest('base64');
  if (expected[file] && hash !== expected[file]) throw new Error(`Integrity mismatch: ${file}`);
  const local = file.replace(/^dist\//, '');
  const target = new URL(local, destination);
  await fs.mkdir(new URL('./', target), { recursive: true });
  await fs.writeFile(target, content);
  manifest.files[local] = { sha256Base64: hash, bytes: content.length };
}
await fs.writeFile(new URL('manifest.json', destination), JSON.stringify(manifest, null, 2) + '\n');
console.log('Vendored Leaflet 1.9.4; JS/CSS integrity matches official documentation.');
