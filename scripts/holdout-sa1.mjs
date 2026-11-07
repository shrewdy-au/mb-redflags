#!/usr/bin/env node
// Held-out check that needs no supplied CSVs.
// For 5 covered suburbs x 10 addresses (GET /v1/suburbs/{SAL}/properties?limit=10), compare the extension's
// area-level public-housing flag (risks/all → public_housing, on-property SA1 share ≥ 10%, the AMBER threshold)
// against two independent Microburbs references:
//   A. demographics/tenure → microburbs[mb = property mb].public_housing_pct ≥ 10   (2021 Census, mesh block)
//   B. surroundings/public-housing → flagged_count / property_count ≥ 5%, or subject flagged   (200 m, address flags)
// Writes AGGREGATE metrics only to out/holdout.json: counts, agreement, precision/recall, correlation.
// No addresses, no G-NAF ids, no raw API output are written or printed.
// Usage: npm run proxy  (live), then  node scripts/holdout-sa1.mjs [--threshold 10]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const PROXY = process.env.PROXY || 'http://127.0.0.1:8787';
const TOKEN = process.env.EXT_TOKEN || 'mb-redflags-local';
const SUBURBS = ['Redfern', 'Waterloo (NSW)', 'Surry Hills', 'Alexandria', 'Zetland'];
const args = process.argv.slice(2);
const T = Number(args[args.indexOf('--threshold') + 1] || 10) || 10;
const T200 = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${PROXY}${path}${qs ? `?${qs}` : ''}`, { headers: { 'X-Ext-Token': TOKEN } });
    if (res.status === 429) { await sleep((Number(res.headers.get('retry-after')) || 2) * 1000); continue; }
    if (!res.ok) return null;
    const b = await res.json().catch(() => null);
    return b && b.data != null ? b.data : null;
  }
  return null;
}
const pct = (v) => { const m = String(v ?? '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

function confusion(pairs) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const [pred, ref] of pairs) { if (pred && ref) tp++; else if (pred) fp++; else if (ref) fn++; else tn++; }
  const n = tp + fp + fn + tn;
  const r3 = (x) => (x === null ? null : Math.round(x * 1000) / 1000);
  return { n, tp, fp, fn, tn, agreement: r3(n ? (tp + tn) / n : null), precision: r3(tp + fp ? tp / (tp + fp) : null), recall: r3(tp + fn ? tp / (tp + fn) : null) };
}
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000 : null;
}

const vsA = [], vsB = [], corrA = [[], []], corrB = [[], []];
const perSuburb = [];
let missing = { sa1_row: 0, tenure_mb: 0, ph200: 0 };
for (const sal of SUBURBS) {
  const S = `/v1/suburbs/${encodeURIComponent(sal)}`;
  const [props, tenure] = await Promise.all([get(`${S}/properties`, { limit: 10 }), get(`${S}/demographics/tenure`)]);
  const list = (props?.results || []).slice(0, 10);
  const mbPh = new Map((tenure?.microburbs || []).map((m) => [String(m.mb), pct(m.public_housing_pct)]));
  const sA = [], sB = [];
  for (const p of list) {
    const P = `/v1/properties/${encodeURIComponent(p.gnaf_pid)}`;
    const [risks, ph] = await Promise.all([get(`${P}/risks/all`), get(`${P}/surroundings/public-housing`)]);
    const rows = Array.isArray(risks?.public_housing) ? risks.public_housing : risks?.public_housing ? [risks.public_housing] : [];
    const on = rows.find((r) => r?.on_property === true);
    if (!risks) { missing.sa1_row++; continue; }
    const sa1 = on ? pct(on.value) ?? 0 : 0; // not in the layer -> 0% share
    const pred = sa1 >= T;
    const a = mbPh.get(String(p.mb));
    if (a == null) missing.tenure_mb++;
    else { vsA.push([pred, a >= T]); sA.push([pred, a >= T]); corrA[0].push(sa1); corrA[1].push(a); }
    if (!ph) missing.ph200++;
    else {
      const share = ph.property_count > 0 ? (100 * (ph.flagged_count ?? 0)) / ph.property_count : 0;
      const subject = (ph.flagged || []).some((f) => f?.gnaf_pid === p.gnaf_pid);
      const ref = share >= T200 || subject;
      vsB.push([pred, ref]); sB.push([pred, ref]); corrB[0].push(sa1); corrB[1].push(share);
    }
  }
  perSuburb.push({ suburb: sal, sampled: list.length, suburb_public_housing_pct_2021: pct(tenure?.public_housing_pct), vs_tenure_mb: confusion(sA), vs_200m: confusion(sB) });
  console.log(`${sal}: sampled ${list.length}`);
}

const out = {
  generated: new Date().toISOString(),
  method: 'holdout-sa1 (no CSV): extension area flag (risks/all public_housing on-property SA1 share ≥ threshold) vs (A) Census 2021 mesh-block public_housing_pct from demographics/tenure and (B) 200 m flagged share from surroundings/public-housing. Aggregates only.',
  threshold_area_pct: T, threshold_200m_pct: T200,
  suburbs: SUBURBS.length, sample_per_suburb: 10,
  vs_tenure_mesh_block: { ...confusion(vsA), pearson_pct: pearson(corrA[0], corrA[1]) },
  vs_surroundings_200m: { ...confusion(vsB), pearson_pct: pearson(corrB[0], corrB[1]) },
  per_suburb: perSuburb,
  missing
};
mkdirSync('out', { recursive: true });
// Keep any CSV-based result written by scripts/holdout.mjs alongside.
const path = 'out/holdout.json';
let prev = {};
if (existsSync(path)) { try { prev = JSON.parse(readFileSync(path, 'utf8')); } catch { prev = {}; } }
const merged = prev && prev.method && !String(prev.method).startsWith('holdout-sa1') ? { csv_holdout: prev, sa1_holdout: out } : { ...(prev.csv_holdout ? { csv_holdout: prev.csv_holdout } : {}), sa1_holdout: out };
writeFileSync(path, JSON.stringify(merged, null, 2));
console.log(JSON.stringify({ vs_tenure_mesh_block: out.vs_tenure_mesh_block, vs_surroundings_200m: out.vs_surroundings_200m, missing }, null, 1));
