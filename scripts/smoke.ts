// Node smoke test: runs the real pipeline + rules against the proxy (start it with MOCK=1).
import { runAnalysis } from '../extension/src/lib/pipeline';
import { buildAddressInfo } from '../extension/src/content/address';

const cases: Array<[string, number | null]> = [
  ['14 Raglan Street, Waterloo NSW 2017', 1350000],
  ['88 Riley Street, Surry Hills NSW 2010', 1900000],
  ['3/12 Raglan St, Waterloo NSW 2017', null],
  ['10 Anzac Parade, Little Bay NSW 2036', null]
];
for (const [addr, asking] of cases) {
  const info = buildAddressInfo(addr)!;
  const out = await runAnalysis(info, asking);
  const r = out!.report;
  console.log(`\n${addr}  [candidates: ${info.candidates.join(' | ')}]`);
  console.log(`  state=${r.state} verdict=${r.verdict ?? '-'} ${r.verdictLine ?? r.message ?? ''} mock=${!!r.mock}`);
  for (const row of r.rows) console.log(`   ${row.status.padEnd(5)} ${row.label.padEnd(32)} ${row.summary}  [${row.level}]`);
}
