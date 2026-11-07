// RAG rules. Thresholds are deliberately simple and documented in README.
// Wording is neutral: these are prompts to investigate, not advice.
import type { MbResult } from './mb';
import type { Row, Status, Verdict } from './types';
import { haversine } from './geo';

export interface Bundle {
  gnaf: string;
  profile?: MbResult;
  risks?: MbResult;
  ph200?: MbResult;
  street?: MbResult;
  avm?: MbResult;
  quoting?: MbResult;
  transport?: MbResult;
  extras?: MbResult;
  hazardCounts?: MbResult;
  asking?: number | null;
}

const VERIFY = true;
const fmtM = (m?: number | null) => (m === null || m === undefined || !isFinite(m) ? '?' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const fmt$ = (n?: number | null) => (n ? `$${Math.round(n).toLocaleString('en-AU')}` : '?');
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') { const m = v.match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; }
  return null;
};

function noData(id: string, label: string, r: MbResult | undefined, endpoint: string, level: Row['level']): Row {
  const why = !r ? 'not requested' : r.ok ? 'empty' : r.kind === 'NO_DATA' ? `no data${r.reason ? ` (${r.reason})` : ''}` : r.message || r.kind;
  return { id, label, status: 'GREY', summary: why, endpoint, level };
}

/** risks/all values may be an array of rows, a single row or missing. Prefer on_property=true, else nearest. */
export function pickRiskRow(v: any): any | undefined {
  const rows: any[] = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
  if (!rows.length) return undefined;
  const on = rows.find((r) => r?.on_property === true);
  if (on) return on;
  return rows.slice().sort((a, b) => (num(a?.nearest_distance_m) ?? 1e9) - (num(b?.nearest_distance_m) ?? 1e9))[0];
}

interface HazardSpec { key: string; label: string; redOn?: boolean; redWithin?: number; amberWithin?: number; amberOn?: boolean }
const HAZARDS: HazardSpec[] = [
  { key: 'flood', label: 'Flood (modelled)', redOn: true, amberWithin: 100 },
  { key: 'historical_flood', label: 'Flood (historical)', redOn: true, amberWithin: 100 },
  { key: 'bushfire', label: 'Bushfire-prone', redOn: true, amberWithin: 100 },
  { key: 'erosion', label: 'Erosion', redOn: true, amberWithin: 200 },
  { key: 'landslide', label: 'Landslide', redOn: true, amberWithin: 100 },
  { key: 'environment', label: 'Contamination / environment', redOn: true, amberWithin: 250 },
  { key: 'hv_power_line', label: 'High-voltage power line', redWithin: 50, amberWithin: 200 },
  { key: 'heritage', label: 'Heritage overlay', amberOn: true },
  { key: 'mobile_black_spot', label: 'Mobile black spot', amberOn: true }
];

function hazardRow(spec: HazardSpec, risks: MbResult | undefined): Row {
  const endpoint = `/v1/properties/{gnaf}/risks/all → ${spec.key}`;
  if (!risks || !risks.ok) return noData(spec.key, spec.label, risks, endpoint, 'property');
  const r = pickRiskRow(risks.data?.[spec.key]);
  const base = { id: spec.key, label: spec.label, endpoint, level: 'property' as const, verify: VERIFY };
  if (!r) return { ...base, status: 'GREEN', summary: 'none within search radius', distance_m: null };
  const on = r.on_property === true;
  const d = on ? 0 : num(r.nearest_distance_m);
  let status: Status = 'GREEN';
  if (on && spec.redOn) status = 'RED';
  else if (on && spec.amberOn) status = 'AMBER';
  else if (spec.redWithin !== undefined && d !== null && d <= spec.redWithin) status = 'RED';
  else if (spec.amberWithin !== undefined && d !== null && d <= spec.amberWithin) status = 'AMBER';
  const summary = on ? 'on property' : `nearest ${fmtM(d)}`;
  const detail = [r.value, r.features_within_radius !== undefined ? `${r.features_within_radius} features within ${r.search_radius_m ?? 1000} m` : ''].filter(Boolean).join(' · ');
  return { ...base, status, summary, distance_m: d, detail };
}

function publicHousingRows(b: Bundle): Row[] {
  const rows: Row[] = [];
  // Area share from risks/all public_housing (two rows: on_property + nearby)
  const ep1 = '/v1/properties/{gnaf}/risks/all → public_housing';
  if (b.risks?.ok) {
    const arr = b.risks.data?.public_housing;
    const list: any[] = Array.isArray(arr) ? arr : arr ? [arr] : [];
    const on = list.find((r) => r?.on_property === true);
    const others = list.filter((r) => r?.on_property !== true).sort((x, y) => (num(x?.nearest_distance_m) ?? 1e9) - (num(y?.nearest_distance_m) ?? 1e9));
    const near = others[0];
    const nearHigh = others.find((r) => (num(r?.value) ?? 0) >= 20);
    const nearTxt = [near ? `nearest mapped area ${fmtM(num(near.nearest_distance_m))} away: ${near.value}` : '',
      nearHigh && nearHigh !== near ? `nearest area ≥20%: ${fmtM(num(nearHigh.nearest_distance_m))} away (${nearHigh.value})` : ''].filter(Boolean).join(' · ');
    if (on) {
      const pct = num(on.value);
      const status: Status = pct === null ? 'GREY' : pct >= 20 ? 'RED' : pct >= 10 ? 'AMBER' : 'GREEN';
      rows.push({ id: 'ph_area', label: 'Public housing — area share', status, summary: `${pct ?? '?'}% of homes in this area`, endpoint: ep1, level: 'SA1', distance_m: 0,
        detail: nearTxt || undefined, verify: VERIFY });
    } else if (list.length) {
      // The layer only lists areas that contain public housing; none covers this address.
      rows.push({ id: 'ph_area', label: 'Public housing — area share', status: 'GREEN', summary: "this address's area is not in the public-housing layer",
        endpoint: ep1, level: 'SA1', distance_m: num(near?.nearest_distance_m), detail: nearTxt || undefined, verify: VERIFY });
    } else rows.push({ id: 'ph_area', label: 'Public housing — area share', status: 'GREEN', summary: 'no public-housing area within 1 km', endpoint: ep1, level: 'SA1' });
  } else rows.push(noData('ph_area', 'Public housing — area share', b.risks, ep1, 'SA1'));

  // 200 m neighbourhood from surroundings/public-housing
  const ep2 = '/v1/properties/{gnaf}/surroundings/public-housing';
  if (b.ph200?.ok) {
    const d = b.ph200.data || {};
    const flagged: any[] = Array.isArray(d.flagged) ? d.flagged : [];
    const fc = num(d.flagged_count) ?? flagged.length;
    const pc = num(d.property_count) ?? 0;
    const share = pc > 0 ? (fc / pc) * 100 : null;
    const subject = flagged.some((f) => f?.gnaf_pid && f.gnaf_pid === b.gnaf);
    let status: Status = share === null ? 'GREY' : share >= 15 ? 'RED' : share >= 5 ? 'AMBER' : 'GREEN';
    if (subject) status = 'RED';
    let nearest: number | null = null;
    const c = b.transport?.ok ? b.transport.data : null;
    if (c && typeof c.center_lat === 'number') {
      for (const f of flagged) if (f.gnaf_pid !== b.gnaf && typeof f.lat === 'number') {
        const dist = haversine(c.center_lat, c.center_lng, f.lat, f.lng);
        nearest = nearest === null ? dist : Math.min(nearest, dist);
      }
    }
    rows.push({ id: 'ph_200', label: 'Public housing — within 200 m', status,
      summary: subject ? 'this address is itself flagged as likely public housing' : `${fc} of ${pc} homes flagged (${share === null ? '?' : share.toFixed(1)}%)`,
      endpoint: ep2, level: '200 m', distance_m: nearest, detail: nearest !== null ? `nearest flagged home ≈ ${fmtM(nearest)} (haversine)` : undefined });
  } else rows.push(noData('ph_200', 'Public housing — within 200 m', b.ph200, ep2, '200 m'));
  return rows;
}

function anefRow(b: Bundle): Row {
  const label = 'Aircraft noise (ANEF)';
  const note = 'microburb estimate, not a property contour';
  const mb = b.profile?.ok ? String(b.profile.data?.mesh_block ?? '') : '';
  if (b.extras?.ok && mb) {
    const list: any[] = b.extras.data?.per_mb?.risks || [];
    const hit = list.find((r) => String(r?.mb) === mb);
    if (hit && 'anef_med' in hit) {
      const v = num(hit.anef_med);
      const status: Status = v === null ? 'GREEN' : v >= 25 ? 'RED' : v >= 20 ? 'AMBER' : 'GREEN';
      return { id: 'anef', label, status, summary: v === null ? 'no mapped exposure' : `ANEF ≈ ${v} (median, mesh block)`,
        endpoint: '/v1/suburbs/{SAL}/risks/extras → per_mb.risks[].anef_med (joined on profile.mesh_block)', level: 'mesh block', detail: `${note}. Mesh block ${mb}.`, verify: VERIFY };
    }
  }
  // Fallback: suburb-level share of properties under aircraft noise
  if (b.hazardCounts?.ok) {
    const an = b.hazardCounts.data?.aircraft_noise || {};
    if (!Object.keys(an).length) {
      return { id: 'anef', label, status: 'GREY', summary: 'no ANEF data returned for this suburb',
        endpoint: '/v1/suburbs/{SAL}/risks/property-hazard-counts → aircraft_noise', level: 'suburb',
        detail: 'Mesh-block anef_med absent from risks/extras and suburb aircraft_noise empty. Check the Sydney Airport ANEF map and the s10.7 certificate.', verify: VERIFY };
    }
    const pct = num(an.pct ?? an.any_pct ?? an.anef20_pct);
    const status: Status = pct !== null && pct >= 10 ? 'AMBER' : 'GREEN';
    return { id: 'anef', label, status, summary: pct === null ? 'no mapped exposure (suburb level)' : `${pct}% of suburb properties in an ANEF area`,
      endpoint: '/v1/suburbs/{SAL}/risks/property-hazard-counts → aircraft_noise', level: 'suburb', detail: `${note}; suburb-level fallback, mesh block value unavailable.`, verify: VERIFY };
  }
  return noData('anef', label, b.extras, '/v1/suburbs/{SAL}/risks/extras', 'mesh block');
}

function streetRow(b: Bundle): Row {
  const ep = '/v1/properties/{gnaf}/street/profile';
  const label = 'Street growth forecast';
  if (!b.street?.ok) return noData('street', label, b.street, ep, 'street');
  const d = b.street.data || {};
  const p = d.profile || {};
  const rank = d.forecast_rank || {};
  const s4 = num(p.annual_4y); const sub4 = num(d.suburb_medians?.annual_4y);
  const n = num(p.n_sales) ?? 0; const conf = String(p.confidence || '');
  const tercile = String(rank.tercile || '');
  let status: Status = 'GREY';
  const confOk = /^(medium|high)/i.test(conf);
  if (n < 10 || /^low/i.test(conf)) status = 'GREY';
  else if (/lower/i.test(tercile) || (s4 !== null && sub4 !== null && s4 <= sub4 - 2)) status = 'RED';
  else if (/upper/i.test(tercile) && s4 !== null && sub4 !== null && s4 > sub4 && confOk) status = 'GREEN';
  else status = 'INFO'; // middle third, or upper third without the supporting evidence: neutral
  const summary = `${p.title || d.street || 'street'}: rank ${rank.rank ?? '?'}/${rank.total ?? d.streets_in_suburb ?? '?'} (${tercile || 'n/a'}), 4-yr ${s4 ?? '?'}%/yr vs suburb ${sub4 ?? '?'}%/yr`;
  return { id: 'street', label, status, summary, endpoint: ep, level: 'street',
    detail: `confidence ${conf || '?'}, ${n} sales${status === 'GREY' ? ' — too thin or low confidence to rate' : status === 'INFO' ? ' — middle of the pack, not rated' : ''}. Forecast, not a guarantee.` };
}

function avmRow(b: Bundle): Row {
  const ep = '/v1/properties/{gnaf}/valuation/avm';
  const label = 'Asking vs AVM';
  if (!b.avm?.ok) return noData('avm', label, b.avm, ep, 'property');
  const a = b.avm.data || {};
  const p = num(a.predicted_price);
  const range = `${fmt$(a.predicted_price_low)}–${fmt$(a.predicted_price_high)}`;
  if (!b.asking || !p) return { id: 'avm', label, status: 'GREY', summary: `AVM ${fmt$(p)} (80% ${range}) — type the asking price to compare`, endpoint: ep, level: 'property' };
  const ratio = b.asking / p;
  const status: Status = ratio > 1.1 ? 'RED' : ratio >= 1.03 ? 'AMBER' : 'GREEN';
  return { id: 'avm', label, status, summary: `asking ${fmt$(b.asking)} is ${((ratio - 1) * 100).toFixed(1)}% vs AVM ${fmt$(p)}`, endpoint: ep, level: 'property',
    detail: `AVM 80% range ${range}, dated ${a.prediction_date || '?'}. Asking price typed by you (not read from the listing).` };
}

function quotingRow(b: Bundle): Row {
  const ep = '/v1/properties/{gnaf}/valuation/agent-quoting';
  const label = 'Agency quoting accuracy';
  if (!b.quoting?.ok) return noData('quoting', label, b.quoting, ep, 'agency');
  const q = b.quoting.data || {};
  const dev = num(q.median_deviation_pct);
  const severe = /severe/i.test(String(q.cohort || ''));
  const status: Status = severe || (dev !== null && dev >= 10) ? 'RED' : 'GREEN';
  return { id: 'quoting', label, status,
    summary: `${q.cohort || 'cohort n/a'}${dev !== null ? `, median ${dev}% above guide` : ''}${status === 'RED' && q.likely_sale_price ? ` → likely ${fmt$(q.likely_sale_price)}` : ''}`,
    endpoint: ep, level: 'agency', detail: `${q.agency_name || 'agency'}; ${q.total_sales ?? '?'} recent sales; underquote rate ${q.underquote_rate_pct ?? '?'}%` };
}

function transportRow(b: Bundle): Row {
  const ep = '/v1/properties/{gnaf}/transport/nearby';
  if (!b.transport?.ok) return noData('transport', 'Nearest transport', b.transport, ep, 'property');
  const n = b.transport.data?.nearest || {};
  const parts = ['train', 'tram', 'bus', 'ferry'].filter((m) => n[m]).map((m) => `${m} ${fmtM(num(n[m].distance_m))}`);
  return { id: 'transport', label: 'Nearest transport', status: 'INFO', summary: parts.join(' · ') || 'none within radius', endpoint: ep, level: 'property' };
}

export function buildRows(b: Bundle): Row[] {
  return [
    ...HAZARDS.slice(0, 6).map((h) => hazardRow(h, b.risks)),
    anefRow(b),
    ...publicHousingRows(b),
    hazardRow(HAZARDS[6], b.risks),
    streetRow(b),
    avmRow(b),
    quotingRow(b),
    hazardRow(HAZARDS[7], b.risks),
    hazardRow(HAZARDS[8], b.risks),
    transportRow(b)
  ];
}

export function verdictOf(rows: Row[]): { verdict: Verdict; line: string } {
  const reds = rows.filter((r) => r.status === 'RED').length;
  const ambers = rows.filter((r) => r.status === 'AMBER').length;
  if (reds) return { verdict: 'NO-GO', line: `${reds} red flag${reds > 1 ? 's' : ''}: investigate before making an offer` };
  if (ambers) return { verdict: 'INVESTIGATE', line: `${ambers} item${ambers > 1 ? 's' : ''} worth checking` };
  return { verdict: 'GO', line: 'No red flags in the mapped data' };
}
