// Copies manifest (and any static assets) into extension/dist after tsup.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'extension', 'dist');
mkdirSync(out, { recursive: true });
copyFileSync(join(root, 'extension', 'manifest.json'), join(out, 'manifest.json'));

const assets = join(root, 'extension', 'assets');
if (existsSync(assets)) {
  for (const f of readdirSync(assets)) {
    const p = join(assets, f);
    if (statSync(p).isFile()) copyFileSync(p, join(out, f));
  }
}
console.log('copied manifest -> extension/dist');
