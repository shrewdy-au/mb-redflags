#!/usr/bin/env node
// `node src/ingest.mjs all` or a list of sources. Each source module exports ingest(); steps are resumable (see lib/state.mjs).
import { end } from './lib/db.mjs';

const ORDER = ['gnaf', 'asgs', 'planning', 'hazards', 'da', 'census', 'afford', 'ato', 'bonds', 'gtfs', 'roads', 'easements', 'derived'];
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const wanted = !args.length || args.includes('all') ? ORDER : args;
const bad = wanted.filter((w) => !ORDER.includes(w));
if (bad.length) { console.error(`unknown source(s): ${bad.join(', ')}. Known: ${ORDER.join(', ')}`); process.exit(2); }

let failed = 0;
for (const name of ORDER.filter((o) => wanted.includes(o))) {
  const t0 = Date.now();
  console.log(`\n=== ${name} ===`);
  try {
    const mod = await import(`./ingest/${name}.mjs`);
    await mod.ingest();
    console.log(`=== ${name} ok (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  } catch (e) {
    failed += 1;
    console.error(`=== ${name} FAILED: ${e?.stack || e}`);
    if (process.env.STOP_ON_FAIL) break;
  }
}
await end();
process.exit(failed ? 1 : 0);
