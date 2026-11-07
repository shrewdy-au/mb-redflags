// Copies manifest, fonts, the drawer page and MapLibre's CSP worker into extension/dist after tsup.
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'extension', 'dist');
mkdirSync(join(out, 'drawer'), { recursive: true });
copyFileSync(join(root, 'extension', 'manifest.json'), join(out, 'manifest.json'));

const assets = join(root, 'extension', 'assets');
if (existsSync(assets)) cpSync(assets, out, { recursive: true }); // fonts/ -> dist/fonts/

const drawer = join(root, 'extension', 'src', 'drawer');
copyFileSync(join(drawer, 'drawer.html'), join(out, 'drawer', 'drawer.html'));
copyFileSync(join(drawer, 'drawer.page.css'), join(out, 'drawer', 'drawer.page.css'));
copyFileSync(join(root, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-csp-worker.js'), join(out, 'drawer', 'maplibre-worker.js'));
console.log('copied manifest, fonts, drawer -> extension/dist');
