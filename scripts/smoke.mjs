// Bundles scripts/smoke.ts with esbuild (ships with tsup) and runs it in Node.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
mkdirSync('out', { recursive: true });
await build({ entryPoints: ['scripts/smoke.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'out/smoke.mjs', logLevel: 'error' });
if (process.env.PROXY_BASE) globalThis.__MBRF_PROXY_BASE__ = process.env.PROXY_BASE;
await import(new URL('../out/smoke.mjs', import.meta.url).href);
