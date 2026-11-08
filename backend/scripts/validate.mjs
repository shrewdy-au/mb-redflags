#!/usr/bin/env node
// Builds VALIDATION.md from two smoke runs of the same addresses:
//   JSON_OUT=out/smoke-open.json  npm run smoke:open     (proxy started with OPEN_DATA=1)
//   JSON_OUT=out/smoke-mb.json    npm run smoke:open     (proxy started without it, Microburbs key loaded)
//   node backend/scripts/validate.mjs out/smoke-open.json out/smoke-mb.json > backend/VALIDATION.md
// Only derived rows (status / summary / distance) are written. Never raw Microburbs payloads.
import { readFileSync } from 'node:fs';

const [openPath, mbPath] = process.argv.slice(2);
if (!openPath || !mbPath) { console.error('usage: validate.mjs <open.json> <microburbs.json>'); process.exit(2); }
const open = JSON.parse(readFileSync(openPath, 'utf8'));
const mb = JSON.parse(readFileSync(mbPath, 'utf8'));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const fmtD = (d) => (d === null || d === undefined ? '' : ` (${Math.round(d)} m)`);
const cell = (r) => (r ? `${r.status} · ${esc(r.summary)}${fmtD(r.distance_m)}` : '—');

const OPEN_ONLY = new Set(['street', 'quoting', 'estimate']); // rows that stay on Microburbs / typed
let out = `# Validation: open-data routes vs Microburbs, ${new Date().toISOString().slice(0, 10)}\n\n`;
out += `Same extension pipeline and rules (\`scripts/smoke.ts\`), same three listings, proxy started once with \`OPEN_DATA=1\` and once\n`;
out += `on the Microburbs key. Cells are what the panel would show: **status · summary (nearest distance)**. "Match" compares the\n`;
out += `RAG status only; a summary difference with the same status is expected (different sources, different wording).\n`;
out += `Street forecast and agency quoting are Microburbs on both sides (passthrough), so they are identical by construction.\n\n`;

const summary = { same: 0, diff: 0, open_grey: 0, mb_grey: 0 };
for (let i = 0; i < open.length; i++) {
  const o = open[i], m = mb.find((x) => x.address === o.address) || mb[i];
  out += `## ${o.address}\n\n`;
  out += `| | open data | Microburbs |\n|---|---|---|\n`;
  out += `| state / verdict | ${o.report.state} / **${o.report.verdict ?? '-'}** — ${esc(o.report.verdictLine ?? o.report.message)} | ${m?.report.state} / **${m?.report.verdict ?? '-'}** — ${esc(m?.report.verdictLine ?? m?.report.message)} |\n`;
  out += `| GNAF | ${o.report.gnaf ?? '-'} (${esc(o.report.address)}) | ${m?.report.gnaf ?? '-'} (${esc(m?.report.address)}) |\n\n`;
  out += `| row | open data | Microburbs | match |\n|---|---|---|---|\n`;
  const ids = [...new Set([...(o.report.rows || []).map((r) => r.id), ...((m?.report.rows) || []).map((r) => r.id)])];
  for (const id of ids) {
    const a = (o.report.rows || []).find((r) => r.id === id), b = ((m?.report.rows) || []).find((r) => r.id === id);
    let match;
    if (OPEN_ONLY.has(id)) match = 'passthrough';
    else if (!a || !b) match = 'missing';
    else if (a.status === b.status) { match = '✅'; summary.same++; }
    else if (a.status === 'GREY' && b.status !== 'GREY') { match = 'open GREY'; summary.open_grey++; }
    else if (b.status === 'GREY' && a.status !== 'GREY') { match = 'MB GREY'; summary.mb_grey++; }
    else { match = '❌'; summary.diff++; }
    out += `| ${id} — ${esc((a || b).label)} | ${cell(a)} | ${cell(b)} | ${match} |\n`;
  }
  out += '\n';
}
out += `## Totals (rows where both sides answered, excluding passthrough)\n\n| same status | different status | open GREY, Microburbs rated | Microburbs GREY, open rated |\n|---|---|---|---|\n| ${summary.same} | ${summary.diff} | ${summary.open_grey} | ${summary.mb_grey} |\n`;
process.stdout.write(out);
