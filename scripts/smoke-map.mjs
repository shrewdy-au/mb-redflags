// Bundles scripts/smoke-map.ts with esbuild and runs it in Node.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
mkdirSync('out', { recursive: true });
await build({ entryPoints: ['scripts/smoke-map.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'out/smoke-map.mjs', logLevel: 'error' });
await import(new URL('../out/smoke-map.mjs', import.meta.url).href);
