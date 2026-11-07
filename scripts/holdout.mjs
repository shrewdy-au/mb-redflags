#!/usr/bin/env node
// Held-out check: does Microburbs' public-housing flag (surroundings/public-housing, subject in `flagged`)
// recover homes listed in the supplied public-housing CSV, versus 20 control addresses?
// Usage: node scripts/holdout.mjs <public-housing.csv> <addresses.csv> [--n 20] [--seed 7]
// Calls the local proxy (npm run proxy). Writes AGGREGATE metrics only to out/holdout.json:
// no addresses, no API output, no CSV rows are written anywhere (hackathon data rules).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [phCsv, addrCsv] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!phCsv || !addrCsv) { console.error('usage: node scripts/holdout.mjs <public-housing.csv> <addresses.csv> [--n 20]'); process.exit(1); }
const N = Number(opt('--n', 20));
const SEED = Number(opt('--seed', 7));
const PROXY = process.env.PROXY || 'http://127.0.0.1:8787';
const TOKEN = process.env.EXT_TOKEN || 'mb-redflags-local';

// --- minimal CSV (quoted fields ok) ---
function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), (r[i] || '').trim()])));
}
// Column-agnostic address builder: a full 'address' column if present, else number + street + suburb.
function addrOf(r) {
  const k = Object.keys(r);
  const full = k.find((x) => /^(full_?)?address$|address_?(full|line|text)/.test(x));
  const sub = r[k.find((x) => /suburb|locality/.test(x))] || '';
  if (full && r[full]) return /,/.test(r[full]) || !sub ? r[full] : `${r[full]}, ${sub}`;
  const num = r[k.find((x) => /number|street_?no|house_?no/.test(x))] || '';
  const st = r[k.find((x) => /street(_?name)?$|^street/.test(x) && !/number|no$/.test(x))] || '';
  const unit = r[k.find((x) => /unit|flat/.test(x))] || '';
  return `${unit ? unit + '/' : ''}${num} ${st}, ${sub}`.trim();
}
const normA = (s) => s.toUpperCase().replace(/[^A-Z0-9/ ]/g, ' ').replace(/\bSTREET\b/g, 'ST').replace(/\bROAD\b/g, 'RD').replace(/\bAVENUE\b/g, 'AVE').replace(/\s+/g, ' ').trim();
function shuffle(a, seed) { let s = seed; const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); return a.map((x) => [r(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]); }

async function get(path, params) {
  const u = new URL(path, PROXY); for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  for (let i = 0; i < 4; i++) {
    const res = await fetch(u, { headers: { 'X-Ext-Token': TOKEN } });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, (Number(res.headers.get('retry-after')) || 2) * 1000)); continue; }
    if (!res.ok) return null;
    const b = await res.json().catch(() => null);
    return b && b.data != null ? b.data : null;
  }
  return null;
}
async function classify(address) {
  const cands = await get('/v1/geocode/address', { address });
  if (!Array.isArray(cands) || !cands.length) return null;
  const numTok = normA(address).split(' ')[0];
  const hit = cands.find((c) => normA(String(c.abbr || '')).startsWith(numTok)) || null;
  if (!hit) return null;
  const s = await get(`/v1/properties/${encodeURIComponent(hit.id)}/surroundings/public-housing`);
  if (!s) return null;
  return (s.flagged || []).some((f) => f.gnaf_pid === hit.id);
}

const ph = parseCsv(readFileSync(phCsv, 'utf8')).map(addrOf).filter(Boolean);
const phSet = new Set(ph.map(normA));
const all = parseCsv(readFileSync(addrCsv, 'utf8')).map(addrOf).filter(Boolean);
const pos = shuffle(ph, SEED).slice(0, N);
const ctrl = shuffle(all.filter((a) => !phSet.has(normA(a))), SEED + 1).slice(0, 20);

const m = { tp: 0, fn: 0, fp: 0, tn: 0, unresolved_pos: 0, unresolved_ctrl: 0 };
for (const a of pos) { const p = await classify(a); if (p === null) m.unresolved_pos++; else p ? m.tp++ : m.fn++; }
for (const a of ctrl) { const p = await classify(a); if (p === null) m.unresolved_ctrl++; else p ? m.fp++ : m.tn++; }
const precision = m.tp + m.fp ? m.tp / (m.tp + m.fp) : null;
const recall = m.tp + m.fn ? m.tp / (m.tp + m.fn) : null;
const result = { check: 'public-housing flag vs supplied CSV (aggregate only)', classifier: 'subject GNAF appears in surroundings/public-housing flagged list',
  n_positive_sampled: pos.length, n_control_sampled: ctrl.length, seed: SEED, ...m,
  precision: precision === null ? null : +precision.toFixed(3), recall: recall === null ? null : +recall.toFixed(3), generated_at: new Date().toISOString() };
mkdirSync('out', { recursive: true });
writeFileSync('out/holdout.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
