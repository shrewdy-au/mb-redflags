// Node smoke test: runs the real pipeline + rules against the proxy.
//   node scripts/smoke.mjs                         -> built-in cases (use with `npm run proxy:mock`)
//   node scripts/smoke.mjs "11 Chelsea Street, Redfern NSW 2016|1900000" ...   -> live addresses (address|asking)
// DUMP=1 writes raw bundles to out/raw/ (gitignored) for debugging. Never commit them.
import { writeFileSync, mkdirSync } from 'node:fs';
import { runAnalysis } from '../extension/src/lib/pipeline';
import { ceilingOf, money } from '../extension/src/lib/nextsteps';
import { buildAddressInfo } from '../extension/src/content/address';

const argv = process.argv.slice(2);
const cases: Array<[string, number | null]> = argv.length
  ? argv.map((a) => { const [addr, ask] = a.split('|'); return [addr, ask ? Number(ask) : null]; })
  : [
    ['14 Raglan Street, Waterloo NSW 2017', 1350000],
    ['88 Riley Street, Surry Hills NSW 2010', 1900000],
    ['3/12 Raglan St, Waterloo NSW 2017', null],
    ['10 Anzac Parade, Little Bay NSW 2036', null]
  ];
for (const [addr, asking] of cases) {
  const info = buildAddressInfo(addr)!;
  const out = await runAnalysis(info, asking);
  const r = out!.report;
  if (process.env.DUMP && out?.bundle) {
    mkdirSync('out/raw', { recursive: true });
    writeFileSync(`out/raw/${addr.replace(/[^A-Za-z0-9]+/g, '_')}.json`, JSON.stringify(out.bundle, null, 1));
  }
  console.log(`\n${addr}  [candidates: ${info.candidates.join(' | ')}]`);
  console.log(`  state=${r.state} verdict=${r.verdict ?? '-'} ${r.verdictLine ?? r.message ?? ''} mock=${!!r.mock} gnaf=${r.gnaf ? 'yes' : 'no'} label=${r.address}`);
  if (r.plain) {
    console.log(`  PLAIN: ${r.plain.words}. ${r.plain.why}`);
    r.plain.questions.forEach((q, i) => console.log(`  ASK ${i + 1}: ${q}`));
    console.log(`  PAY: ${r.plain.pay ?? '-'}`);
    console.log(`  SURE: ${r.plain.sure}`);
    const x = r.next;
    if (x) {
      console.log(`  1 ENQUIRE: ${r.plain.words}. ${r.plain.why} ${x.enquire.rec}`);
      console.log(`  2 MESSAGE:\n${x.message.split('\n').map((l) => '     | ' + l).join('\n')}`);
      console.log(`  3 INSPECT:\n${x.inspect.map((l) => '     - ' + l).join('\n')}`);
      console.log(`  4 SHORTLIST ITEM: ${JSON.stringify(x.short)}`);
      const c = ceilingOf(x.offer);
      console.log(`  5 OFFER: AVM ${money(x.offer.avmLow)}–${money(x.offer.avmHigh)} (mid ${money(x.offer.avmMid)}) · agency ${x.offer.cohort || 'n/a'}${x.offer.likelyPct !== null ? ` → likely sale ≈ guide × ${(1 + x.offer.likelyPct / 100).toFixed(3)}` : ''} · red-flag haircut −${x.offer.haircut}% · Your ceiling: ${money(c)} (your call; set it before auction day)`);
    }
    if (process.env.PLAIN_ONLY) continue;
  }
  for (const row of r.rows) console.log(`   ${row.status.padEnd(5)} ${row.label.padEnd(32)} ${row.summary}  [${row.level}${row.distance_m !== undefined && row.distance_m !== null ? `, ${Math.round(row.distance_m)} m` : ''}]${row.detail ? `\n         ${row.detail}` : ''}`);
}
