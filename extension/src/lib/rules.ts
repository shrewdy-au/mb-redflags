// RAG rules. Thresholds are deliberately simple and documented in README.
// Wording is neutral: these are prompts to investigate, not advice.
import type { MbResult } from './mb';
import type { Row, Status, Verdict } from './types';
import { haversine } from './geo';
import { centerOf, containing } from './maplayers';

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
  ptype?: 'house' | 'unit';
  tenure?: MbResult; priceMap?: MbResult; investor?: MbResult; stress?: MbResult; negGearing?: MbResult; afford?: MbResult;
  yieldPct?: MbResult; vacancy?: MbResult; vacMap?: MbResult; das?: MbResult; rates?: MbResult; zoning?: MbResult; controls?: MbResult;
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
  // Sparkline: history 2024-2026 (street + suburb median), then the 2-yr / 4-yr targets at 2028 / 2030 (dashed).
  const hist: any[] = Array.isArray(p.history) ? p.history.filter((x: any) => num(x?.year) !== null && x.year >= 2024 && x.year <= 2026) : [];
  const streetPts: Array<[number, number]> = hist.filter((x) => num(x.price) !== null).map((x) => [x.year, num(x.price)!]);
  const subPts: Array<[number, number]> = hist.filter((x) => num(x.suburb_med) !== null).map((x) => [x.year, num(x.suburb_med)!]);
  const cur = num(p.current_price);
  if (cur !== null && !streetPts.some((q) => q[0] === 2026)) streetPts.push([2026, cur]);
  const t2 = num(p.target_2y), t4 = num(p.target_4y);
  if (t2 !== null) streetPts.push([2028, t2]);
  if (t4 !== null) streetPts.push([2030, t4]);
  const lastSub = subPts[subPts.length - 1];
  if (lastSub && sub4 !== null) subPts.push([2030, lastSub[1] * Math.pow(1 + sub4 / 100, 2030 - lastSub[0])]);
  const chart = streetPts.length >= 2 ? { street: streetPts, suburb: subPts, lastYear: 2026 } : undefined;
  return { id: 'street', label, status, summary, endpoint: ep, level: 'street', chart,
    detail: `confidence ${conf || '?'}, ${n} sales${status === 'GREY' ? ' — too thin or low confidence to rate' : status === 'INFO' ? ' — middle of the pack, not rated' : ''}. Forecast, not a guarantee.` };
}

function avmRow(b: Bundle): Row {
  const ep = '/v1/properties/{gnaf}/valuation/avm';
  const label = 'Microburbs valuation (AVM)';
  if (!b.avm?.ok) return noData('avm', label, b.avm, ep, 'property');
  const a = b.avm.data || {};
  const p = num(a.predicted_price);
  const range = `${fmt$(a.predicted_price_low)}–${fmt$(a.predicted_price_high)}`;
  if (!b.asking || !p) return { id: 'avm', label, status: 'INFO', summary: `${fmt$(p)} (80% range ${range})`, endpoint: ep, level: 'property',
    detail: `Automated valuation dated ${a.prediction_date || '?'}. Indicative only.` };
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

const pct = (v: number | null, dp = 0) => (v === null ? '?' : `${v.toFixed(dp)}%`);
const mbOf = (b: Bundle) => (b.profile?.ok ? String(b.profile.data?.mesh_block ?? '') : '');
const median = (xs: number[]) => { const a = xs.filter((x) => isFinite(x)).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const featuresOf = (g: any): any[] => (g && Array.isArray(g.features) ? g.features.filter((f: any) => f && f.geometry) : []);

/** v3 rows: tenure, market, negative gearing, insurance, planning limits, DAs, rates. */
function v3Rows(b: Bundle): Row[] {
  const out: Row[] = [];
  const S = '/v1/suburbs/{SAL}';
  const mb = mbOf(b);
  // 1. Tenure
  {
    const ep = `${S}/demographics/tenure`;
    if (b.tenure?.ok) {
      const d = b.tenure.data || {};
      const own = num(d.owner_occupied_pct), rent = num(d.renting_pct);
      const mine = (d.microburbs || []).find((m: any) => String(m?.mb) === mb);
      const mOwn = mine ? (num(mine.owned_outright_pct) ?? 0) + (num(mine.mortgaged_pct) ?? 0) : null;
      out.push({ id: 'tenure', label: 'Owner-occupied / rented', status: 'INFO', summary: `Owner-occ ${pct(own)} · Rented ${pct(rent)}`, endpoint: ep, level: 'suburb',
        detail: mine ? `This mesh block (${mine.street || mb}): owner-occ ${pct(mOwn)} · rented ${pct(num(mine.renting_pct))}` : `Census ${d.census_year ?? 2021}; tier ${d.tier || '?'}` });
    } else out.push(noData('tenure', 'Owner-occupied / rented', b.tenure, ep, 'suburb'));
  }
  // 3. Median price (microburb vs suburb)
  {
    const ep = `${S}/market/median-price-map?property_type=${b.ptype || 'house'}`;
    if (b.priceMap?.ok) {
      const list: any[] = b.priceMap.data?.microburbs || [];
      const mine = list.find((m) => String(m?.mb) === mb);
      const sub = median(list.map((m) => num(m?.median_price) ?? NaN));
      const v = mine ? num(mine.median_price) : null;
      out.push({ id: 'median_price', label: `Median ${b.ptype || 'house'} price`, status: 'INFO',
        summary: v ? `${fmt$(v)} here vs ${fmt$(sub)} suburb${sub ? ` (${v >= sub ? '+' : ''}${(((v / sub) - 1) * 100).toFixed(0)}%)` : ''}` : `suburb ${fmt$(sub)} (no value for this mesh block)`,
        endpoint: ep, level: 'mesh block', detail: `As of ${b.priceMap.data?.as_of || '?'}; suburb figure = median of ${list.length} microburb medians.` });
    } else out.push(noData('median_price', `Median ${b.ptype || 'house'} price`, b.priceMap, ep, 'mesh block'));
  }
  // 4. Investor concentration
  {
    const ep = `${S}/market/investor-concentration`;
    if (b.investor?.ok) {
      const d = b.investor.data || {};
      const mine = (d.mbs || []).find((m: any) => String(m?.mb) === mb);
      const v = mine ? num(mine.pct_investment) : num(d.rental_share_pct);
      out.push({ id: 'investor', label: 'Investor concentration', status: v !== null && v >= 60 ? 'AMBER' : v === null ? 'GREY' : 'GREEN',
        summary: `${pct(v)} investment-owned${mine ? '' : ' (suburb)'}`, endpoint: ep, level: mine ? 'mesh block' : 'suburb', detail: `Suburb ${pct(num(d.rental_share_pct), 1)}` });
    } else out.push(noData('investor', 'Investor concentration', b.investor, ep, 'mesh block'));
  }
  // 5. Mortgage stress
  {
    const ep = `${S}/market/mortgage-stress`;
    if (b.stress?.ok) {
      const d = b.stress.data || {};
      const mine = (d.mbs || []).find((m: any) => String(m?.mb) === mb);
      const v = mine ? num(mine.score) : num(d.score);
      out.push({ id: 'mortgage_stress', label: 'Mortgage stress', status: v === null ? 'GREY' : v >= 60 ? 'RED' : v >= 40 ? 'AMBER' : 'GREEN',
        summary: `score ${v ?? '?'} / 100${mine ? '' : ' (suburb)'}`, endpoint: ep, level: mine ? 'mesh block' : 'suburb', detail: `Suburb score ${num(d.score) ?? '?'}` });
    } else out.push(noData('mortgage_stress', 'Mortgage stress', b.stress, ep, 'mesh block'));
  }
  // 6. Negative gearing
  {
    const ep = '/v1/properties/{gnaf}/valuation/negative-gearing';
    if (b.negGearing?.ok) {
      const d = b.negGearing.data || {};
      const wk = num(d.net_cashflow_80lvr_wk);
      const sus = d.rent_estimate_suspect === true;
      out.push({ id: 'neg_gearing', label: 'Negative gearing', status: sus ? 'GREY' : 'INFO',
        summary: wk === null ? 'n/a' : `${wk < 0 ? '−' : '+'}$${Math.abs(Math.round(wk)).toLocaleString('en-AU')}/wk at 80% LVR${d.is_negatively_geared ? ' (negatively geared)' : ''}`,
        endpoint: ep, level: 'property', detail: `Gross yield ${d.gross_yield_pct ?? '?'}%${sus ? '; rent estimate flagged suspect, so not rated' : ''}` });
    } else out.push(noData('neg_gearing', 'Negative gearing', b.negGearing, ep, 'property'));
  }
  // 7. Affordability
  {
    const ep = `${S}/market/affordability`;
    if (b.afford?.ok) {
      const d = b.afford.data || {};
      out.push({ id: 'affordability', label: 'Affordability', status: 'INFO', summary: `index ${d.index ?? '?'} · ${d.zone || ''}`.trim(), endpoint: ep, level: 'suburb',
        detail: `Price to salary ${num(d.price_to_salary)?.toFixed(1) ?? '?'}; postcode ${d.poa || '?'}` });
    } else out.push(noData('affordability', 'Affordability', b.afford, ep, 'suburb'));
  }
  // 8. Gross yield
  {
    const ep = `${S}/market/yield-pct`;
    if (b.yieldPct?.ok) {
      const d = b.yieldPct.data || {};
      const v = num(d[b.ptype || 'house']);
      const p = v === null ? null : v * 100;
      out.push({ id: 'yield', label: `Gross yield (${b.ptype || 'house'})`, status: p !== null && b.ptype === 'unit' && p < 3 ? 'AMBER' : p === null ? 'GREY' : 'INFO',
        summary: pct(p, 1), endpoint: ep, level: 'suburb', detail: `Houses ${pct(num(d.house) !== null ? num(d.house)! * 100 : null, 1)} · units ${pct(num(d.unit) !== null ? num(d.unit)! * 100 : null, 1)} · as of ${d.as_of || '?'}` });
    } else out.push(noData('yield', 'Gross yield', b.yieldPct, ep, 'suburb'));
  }
  // 9. Vacancy
  {
    const ep = `${S}/market/vacancy-rate`;
    if (b.vacancy?.ok) {
      const d = b.vacancy.data || {};
      const v = num(d[b.ptype || 'house']?.value);
      const mine = b.vacMap?.ok ? (b.vacMap.data?.mbs || []).find((m: any) => String(m?.mb) === mb) : undefined;
      const p = v === null ? null : v * 100;
      out.push({ id: 'vacancy', label: 'Vacancy rate', status: p === null ? 'GREY' : p > 3 ? 'RED' : p >= 2 ? 'AMBER' : 'GREEN',
        summary: `${pct(p, 1)} (${b.ptype || 'house'}s, suburb)`, endpoint: ep, level: 'suburb',
        detail: [mine ? `Mesh block vacancy ${pct(num(mine.vacancy_pct), 1)}${mine.has_listings ? '' : ' (no listings)'}` : '', `as of ${d.as_of || '?'}`].filter(Boolean).join(' · ') });
    } else out.push(noData('vacancy', 'Vacancy rate', b.vacancy, ep, 'suburb'));
  }
  // 10. Landlord insurance (same risks/extras response the ANEF row reads)
  {
    const ep = `${S}/risks/extras → insurance`;
    const ins = b.extras?.ok ? b.extras.data?.insurance : null;
    if (ins && (num(ins.comp_med) !== null || num(ins.basic_med) !== null)) {
      out.push({ id: 'insurance', label: 'Landlord insurance', status: 'INFO', summary: `~${fmt$(num(ins.comp_med))}/yr median (comprehensive)`, endpoint: ep, level: 'suburb',
        detail: `Basic ~${fmt$(num(ins.basic_med))}/yr; ${ins.n ?? '?'} mesh blocks` });
    } else out.push(noData('insurance', 'Landlord insurance', b.extras, ep, 'suburb'));
  }
  // 11. Max height + zone at the property (point-in-polygon)
  {
    const ep = `${S}/development/building-controls + zoning-map`;
    const c = centerOf(b);
    const hob = b.controls?.ok ? containing(featuresOf(b.controls.data?.hob?.geojson), c) : undefined;
    const zone = b.zoning?.ok ? containing(featuresOf(b.zoning.data?.geojson), c) : undefined;
    const fsr = b.controls?.ok ? containing(featuresOf(b.controls.data?.fsr?.geojson), c) : undefined;
    if (hob || zone) {
      out.push({ id: 'max_height', label: 'Planning: zone + height limit', status: 'INFO',
        summary: [hob ? `Max height ${num(hob.properties?.height_m) ?? '?'} m (HOB)` : '', zone ? `${zone.properties?.sym_code || ''} ${zone.properties?.lay_class || ''}`.trim() : ''].filter(Boolean).join(' · '),
        endpoint: ep, level: 'property', detail: fsr ? `FSR ${fsr.properties?.fsr ?? fsr.properties?.value ?? '?'}:1` : undefined, verify: VERIFY });
    } else out.push({ ...noData('max_height', 'Planning: zone + height limit', b.controls, ep, 'property'), summary: c ? 'no control mapped at this point' : 'no property position' });
  }
  // 12. Development applications
  {
    const ep = `${S}/development/applications`;
    if (b.das?.ok) {
      const c = centerOf(b);
      const list: any[] = Array.isArray(b.das.data) ? b.das.data : b.das.data?.applications || b.das.data?.items || b.das.data?.das || [];
      const withD = list.map((a) => ({ a, d: c && typeof (a.lat ?? a.latitude) === 'number' ? haversine(c[1], c[0], a.lat ?? a.latitude, a.lng ?? a.lon ?? a.longitude) : null }))
        .filter((x) => x.d !== null).sort((x, y) => x.d! - y.d!);
      const near = withD.filter((x) => x.d! <= 300);
      const big = withD.find((x) => x.d! <= 100 && /demoli|new dwelling|erect|construct/i.test(`${x.a.title || ''} ${x.a.description || ''} ${x.a.type || ''}`));
      const n0 = withD[0];
      out.push({ id: 'das', label: 'Development applications', status: big ? 'AMBER' : 'INFO',
        summary: `${near.length} within 300 m${n0 ? ` · nearest ${fmtM(n0.d)}` : ''}`, endpoint: ep, level: 'property', distance_m: n0?.d ?? null,
        detail: n0 ? `${n0.a.title || n0.a.description || 'DA'} · ${n0.a.stage || n0.a.status || '?'} · ${n0.a.date || n0.a.lodged || n0.a.lodgement_date || '?'}` : undefined });
    } else out.push(noData('das', 'Development applications', b.das, ep, 'suburb'));
  }
  // 13. Council rates
  {
    const ep = `${S}/development/council-rates`;
    if (b.rates?.ok) {
      const d = b.rates.data || {};
      out.push({ id: 'council_rates', label: 'Council rates', status: 'INFO', summary: `${fmt$(num(d.avg_rate_aud_yr))}/yr average`, endpoint: ep, level: 'suburb',
        detail: `${d.lga || ''} council · source ${d.data_source || '?'}` });
    } else out.push(noData('council_rates', 'Council rates', b.rates, ep, 'suburb'));
  }
  return out;
}

/** Info rows that exist to open the map drawer; their layers are fetched only on click. */
function mapOnlyRows(): Row[] {
  return [
    { id: 'roads', label: 'Busy roads + noise', status: 'INFO', summary: 'busy roads and the noise heatmap · open the map',
      endpoint: '/v1/suburbs/{SAL}/shapes/busy-roads + noise-heatmap', level: 'suburb' },
    { id: 'easements', label: 'Easements', status: 'INFO', summary: 'mapped easements within 1 km · open the map',
      endpoint: '/v1/suburbs/{SAL}/shapes/easements', level: 'suburb', verify: VERIFY }
  ];
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
    transportRow(b),
    ...v3Rows(b),
    ...mapOnlyRows()
  ];
}

export function verdictOf(rows: Row[]): { verdict: Verdict; line: string } {
  const reds = rows.filter((r) => r.status === 'RED').length;
  const ambers = rows.filter((r) => r.status === 'AMBER').length;
  if (reds) return { verdict: 'NO-GO', line: `${reds} red flag${reds > 1 ? 's' : ''}: investigate before making an offer` };
  if (ambers) return { verdict: 'INVESTIGATE', line: `${ambers} item${ambers > 1 ? 's' : ''} worth checking` };
  return { verdict: 'GO', line: 'No red flags in the mapped data' };
}
