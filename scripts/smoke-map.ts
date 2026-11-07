// Node smoke test for the map drawer: runs the pipeline, then builds the drawer payload for every map row.
//   node scripts/smoke-map.mjs "14 Raglan Street, Waterloo NSW 2017"
// Writes payloads to out/maps/ (gitignored: API output, never commit) for the headless drawer check.
import { mkdirSync, writeFileSync } from 'node:fs';
import { runAnalysis } from '../extension/src/lib/pipeline';
import { buildMapPayload } from '../extension/src/lib/maplayers';
import { MAP_ROW_IDS } from '../extension/src/lib/mapids';
import { buildAddressInfo } from '../extension/src/content/address';
import type { MbResult } from '../extension/src/lib/mb';

const addr = process.argv[2] || '14 Raglan Street, Waterloo NSW 2017';
const out = await runAnalysis(buildAddressInfo(addr)!, null);
const r = out!.report;
if (!out?.bundle || !r.sal) { console.log('no bundle', r.state, r.message); process.exit(1); }
const cache = new Map<string, Promise<MbResult>>();
mkdirSync('out/maps', { recursive: true });
writeFileSync('out/maps/_report.json', JSON.stringify(r));
let calls = 0;
for (const id of MAP_ROW_IDS) {
  const before = cache.size;
  const p = await buildMapPayload(id, { gnaf: out.bundle.gnaf, sal: r.sal, address: r.address, bundle: out.bundle, cache });
  calls += cache.size - before;
  writeFileSync(`out/maps/${id}.json`, JSON.stringify(p));
  console.log(`${id.padEnd(16)} center=${p.center ? 'yes' : 'no '} layers=${p.layers.map((l) => `${l.id}:${l.data?.features?.length ?? 0}`).join(',') || '-'}` +
    `${p.empty ? `  empty="${p.empty}"` : ''}${p.error ? `  error=${p.error}` : ''}${p.card ? `  card=[${p.card.lines.join(' | ')}]` : ''}  (+${cache.size - before} calls)`);
}
console.log(`total map calls: ${calls}`);
