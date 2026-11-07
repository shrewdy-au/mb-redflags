// Chrome-free pipeline: address -> GNAF -> tier-1 fan-out -> rows. Used by background.ts and scripts/smoke.
import { mbGet, settledPool, type MbResult } from './mb';
import { buildRows, verdictOf, type Bundle } from './rules';
import { toSal } from './coverage';
import { plainOf } from './plain';
import { nextStepsOf } from './nextsteps';
import { CONCURRENCY } from './config';
import type { AddressInfo, Report } from './types';

const ABBR: Record<string, string> = {
  STREET: 'ST', ROAD: 'RD', AVENUE: 'AVE', LANE: 'LANE', PLACE: 'PL', CRESCENT: 'CRES', DRIVE: 'DR', PARADE: 'PDE',
  TERRACE: 'TCE', COURT: 'CT', CLOSE: 'CL', HIGHWAY: 'HWY', SQUARE: 'SQ', BOULEVARD: 'BVD', WAY: 'WAY', ROW: 'ROW', GROVE: 'GR', CIRCUIT: 'CCT'
};
const norm = (s: string) => s.toUpperCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean).map((w) => ABBR[w] || w).join(' ');

/** Pick the geocode candidate whose `abbr` matches street number + street name (unit bonus). */
export function pickGnaf(cands: any[], a: AddressInfo): any | undefined {
  if (!Array.isArray(cands) || !cands.length) return undefined;
  const num = (a.number || '').toUpperCase();
  const street = norm(a.streetName || '');
  const streetCore = street.split(' ')[0] || '';
  const suburb = norm((a.suburb || '').replace(/\s*\(.*\)\s*$/, ''));
  const scored = cands.map((c) => {
    const abbr = norm(String(c.abbr || c.name || ''));
    let s = 0;
    if (num && new RegExp(`(^|[\\s/])${num}(\\s|$)`).test(abbr)) s += 2;
    if (street && abbr.includes(street)) s += 2; else if (streetCore && abbr.includes(streetCore)) s += 1;
    const isUnit = /^(UNIT|SUITE|SHOP|APT|FLAT)\s|^\w+\//.test(abbr);
    if (a.unit) {
      const u = a.unit.toUpperCase();
      if (new RegExp(`^(UNIT |SUITE |APT |FLAT )?${u}/`).test(abbr) || abbr.includes(`UNIT ${u} `)) s += 1; else s -= 1;
    } else if (isUnit) s -= 0.5; // a house address should not land on a unit in the same block
    if (suburb && abbr.endsWith(` ${suburb}`)) s += 0.5;
    return { c, s };
  }).sort((x, y) => y.s - x.s);
  return scored[0].s >= 3 ? scored[0].c : undefined;
}

export async function resolveGnaf(a: AddressInfo): Promise<{ gnaf?: string; label?: string; ptype?: string; err?: MbResult; mock: boolean }> {
  let mock = false;
  let last: MbResult | undefined;
  for (const q of a.candidates) {
    const r = await mbGet<any[]>('/v1/geocode/address', { address: q });
    mock = mock || r.mock;
    if (!r.ok) { last = r; if (r.kind === 'OUTSIDE_COVERAGE' || r.kind === 'ERROR') break; continue; }
    const hit = pickGnaf(r.data, a);
    if (hit) return { gnaf: hit.id, label: hit.display_name || hit.name, ptype: hit.property_type, mock };
  }
  return { err: last, mock };
}

export function finish(r: Report, b: Bundle): Report {
  const rows = buildRows(b);
  const { verdict, line } = verdictOf(rows);
  const plain = plainOf(rows, verdict, b);
  return { ...r, rows, verdict, verdictLine: line, state: 'done', asking: b.asking ?? null, plain, next: nextStepsOf(rows, verdict, plain, b, r.address) };
}

/** Full run. `progress` gets the loading report; `stale` lets the caller abort if the tab moved on. */
export async function runAnalysis(a: AddressInfo, asking: number | null, stale: () => boolean = () => false,
  progress: (r: Report) => void = () => undefined): Promise<{ report: Report; bundle?: Bundle } | undefined> {
  const sal = toSal(a.suburb);
  if (!sal) {
    return { report: { address: a.raw, rows: [], state: 'outside', message: `${a.suburb || 'This suburb'} is outside the City of Sydney coverage (29 suburbs). No API calls made.` } };
  }
  progress({ address: a.raw, rows: [], state: 'loading', asking });
  const g = await resolveGnaf(a);
  if (stale()) return;
  if (!g.gnaf) {
    const e = g.err && !g.err.ok ? g.err : undefined;
    return { report: { address: a.raw, sal, rows: [], mock: g.mock,
      state: e?.kind === 'OUTSIDE_COVERAGE' ? 'outside' : e?.kind === 'ERROR' ? 'error' : 'not_found',
      message: e?.message && e.kind !== 'NO_DATA' ? e.message : 'No G-NAF match on street number + street. Try the manual address box.' } };
  }
  const gnaf = g.gnaf;
  const P = `/v1/properties/${encodeURIComponent(gnaf)}`;
  const S = `/v1/suburbs/${encodeURIComponent(sal)}`;
  const jobs: Array<[keyof Bundle, () => Promise<MbResult>]> = [
    ['profile', () => mbGet(`${P}/profile`)],
    ['risks', () => mbGet(`${P}/risks/all`)],
    ['ph200', () => mbGet(`${P}/surroundings/public-housing`)],
    ['street', () => mbGet(`${P}/street/profile`)],
    ['avm', () => mbGet(`${P}/valuation/avm`)],
    ['quoting', () => mbGet(`${P}/valuation/agent-quoting`)],
    ['transport', () => mbGet(`${P}/transport/nearby`)],
    ['extras', () => mbGet(`${S}/risks/extras`)]
  ];
  const settled = await settledPool(jobs.map(([, fn]) => fn), CONCURRENCY);
  if (stale()) return;
  const bundle: Bundle = { gnaf, asking };
  settled.forEach((s, i) => {
    (bundle as any)[jobs[i][0]] = s.status === 'fulfilled' ? s.value : { ok: false, kind: 'ERROR', message: String(s.reason), mock: false, endpoint: '' };
  });
  // ANEF join: profile.mesh_block -> extras.per_mb.risks[].anef_med; else suburb-level hazard counts.
  const mb = bundle.profile?.ok ? String(bundle.profile.data?.mesh_block ?? '') : '';
  const hasAnef = !!(bundle.extras?.ok && mb && (bundle.extras.data?.per_mb?.risks || []).some((r: any) => String(r?.mb) === mb && 'anef_med' in r));
  if (!hasAnef) bundle.hazardCounts = await mbGet(`${S}/risks/property-hazard-counts`);
  if (stale()) return;
  // Tier 2 (v3 rows): suburb calls use the exact SAL from the property profile.
  const sal2 = (bundle.profile?.ok && typeof bundle.profile.data?.suburb === 'string' && bundle.profile.data.suburb) || sal;
  const S2 = `/v1/suburbs/${encodeURIComponent(sal2)}`;
  bundle.ptype = /unit|apartment|flat/i.test(String(g.ptype || '')) ? 'unit' : 'house';
  const jobs2: Array<[keyof Bundle, () => Promise<MbResult>]> = [
    ['tenure', () => mbGet(`${S2}/demographics/tenure`)],
    ['priceMap', () => mbGet(`${S2}/market/median-price-map`, { property_type: bundle.ptype })],
    ['investor', () => mbGet(`${S2}/market/investor-concentration`)],
    ['stress', () => mbGet(`${S2}/market/mortgage-stress`)],
    ['negGearing', () => mbGet(`${P}/valuation/negative-gearing`)],
    ['afford', () => mbGet(`${S2}/market/affordability`)],
    ['yieldPct', () => mbGet(`${S2}/market/yield-pct`)],
    ['vacancy', () => mbGet(`${S2}/market/vacancy-rate`)],
    ['vacMap', () => mbGet(`${S2}/market/vacancy-map`)],
    ['das', () => mbGet(`${S2}/development/applications`)],
    ['rates', () => mbGet(`${S2}/development/council-rates`)],
    ['zoning', () => mbGet(`${S2}/development/zoning-map`)],
    ['controls', () => mbGet(`${S2}/development/building-controls`)]
  ];
  const settled2 = await settledPool(jobs2.map(([, fn]) => fn), CONCURRENCY);
  if (stale()) return;
  settled2.forEach((s, i) => {
    (bundle as any)[jobs2[i][0]] = s.status === 'fulfilled' ? s.value : { ok: false, kind: 'ERROR', message: String(s.reason), mock: false, endpoint: '' };
  });
  if (stale()) return;
  const mock = g.mock || settled.some((s) => s.status === 'fulfilled' && s.value.mock);
  return { bundle, report: finish({ address: g.label || a.raw, gnaf, sal: sal2, rows: [], state: 'done', mock }, bundle) };
}
