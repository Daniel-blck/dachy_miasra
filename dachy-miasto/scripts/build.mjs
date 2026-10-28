import fs from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await fs.mkdir(dist, { recursive: true });
for (const file of ['index.html', 'styles.css', 'MONITORING.md', 'SIMULATION.md', 'DATA_SOURCES.md', 'NUMBERS.ru.md', 'NUMBERS.pl.md']) await fs.copyFile(new URL(file, root), new URL(file, dist));
for (const folder of ['src', 'data', 'vendor', 'firmware']) await fs.cp(new URL(folder, root), new URL(folder, dist), { recursive: true });
console.log('Static application packaged in dist/.');
