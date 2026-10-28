import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const target = path.resolve(fileURLToPath(dist));
if (path.dirname(target) !== path.resolve(fileURLToPath(root)) || path.basename(target) !== 'dist') throw new Error('Unexpected build output directory.');
// dist is generated output; a clean directory prevents removed features remaining in a new package.
await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
for (const file of ['index.html', 'styles.css', 'SIMULATION.md', 'DATA_SOURCES.md', 'NUMBERS.ru.md', 'NUMBERS.pl.md']) await fs.copyFile(new URL(file, root), new URL(file, dist));
for (const folder of ['src', 'data', 'vendor']) await fs.cp(new URL(folder, root), new URL(folder, dist), { recursive: true });
console.log('Static application packaged in dist/.');
