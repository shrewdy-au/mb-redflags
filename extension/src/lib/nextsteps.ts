// "Next steps": the five questions a first-time buyer can't answer. Deterministic templates from the rows and a few
// bundle numbers. Never reads listing text, never includes the address of a flagged neighbour.
import type { Bundle } from './rules';
import type { NextSteps, Plain, Row, ShortItem, Verdict } from './types';

const n = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && /-?\d/.test(v) ? Number(v.match(/-?\d+(?:\.\d+)?/)![0]) : null);
export const money = (v: number | null) => (v === null ? '?' : `$${Math.round(v).toLocaleString('en-AU')}`);
const first = (s: string, re: RegExp) => { const m = s.match(re); return m ? Number(m[1]) : null; };

export function nextStepsOf(rows: Row[], verdict: Verdict, plain: Plain, b: Bundle, address: string): NextSteps {
  const st = (id: string) => rows.find((r) => r.id === id);
  const flagged = (id: string) => ['RED', 'AMBER'].includes(st(id)?.status || '');
  const avm = b.avm?.ok ? b.avm.data || {} : {};
  const lo = n(avm.predicted_price_low), mid = n(avm.predicted_price), hi = n(avm.predicted_price_high);
  const unit = b.ptype === 'unit';

  // 1. Enquire or not?
  const rec = verdict === 'GO' ? 'Worth a look → enquire today.'
    : verdict === 'INVESTIGATE' ? 'Look closer first → enquire, and ask the questions below before you book a visit.'
    : `Walk away for now → skip unless the price is well below ${money(lo)} (the low end of Microburbs' price estimate).`;

  // 2. Enquiry message
  const q = [...plain.questions.filter((x) => !/walk away/i.test(x))];
  const q0 = b.quoting?.ok ? b.quoting.data || {} : null;
  if (q0 && (/underquot/i.test(String(q0.cohort || '')) || flagged('quoting'))) q.unshift('What price guide are you quoting, and what did your last five similar sales sell for against their guides?');
  q.push('Is the contract and the s10.7 planning certificate available?');
  if (unit) q.push('What are the strata levies, and are any special levies planned?');
  const uniq = [...new Set(q)].slice(0, 4);
  const message = ['Hi,', '', "I'm interested in this property and have a few questions before I inspect:", '',
    ...uniq.map((x, i) => `${i + 1}. ${x}`), '', 'Could you also send the contract of sale and the upcoming inspection times?', '', 'Thanks,'].join('\n');

  // 3. Inspection checklist
  const look: string[] = [];
  if (flagged('heritage')) look.push('Original fabric: windows, roofline, and anything altered without approval.');
  if (st('flood')?.status !== 'GREEN' || st('historical_flood')?.status !== 'GREEN') look.push('Damp lines, drainage, and how the street sits against the nearest creek or low point.');
  if (st('environment')?.status && st('environment')!.status !== 'GREEN') look.push('Signs of fill or old industrial use next door.');
  if (st('hv_power_line')?.status && !['GREEN', 'GREY'].includes(st('hv_power_line')!.status)) look.push('Look up: how far the power line is, and any easement markers.');
  look.push('Stand outside for five minutes at the time you would usually be home (traffic and noise).');
  const da = st('das'); if (da && da.distance_m != null && da.status !== 'GREY') look.push(`Walk to the building site ${Math.round(da.distance_m)} m away: what is going up?`);
  if (flagged('ph_area') || flagged('ph_200')) look.push('Walk the street at 6 pm to get a feel for it.');
  if (unit) look.push('Common areas, levy notices, and water damage in stairwells.');
  look.push(`Orientation and natural light, mobile reception${st('mobile_black_spot')?.status === 'AMBER' ? ' (this spot is mapped as a black spot)' : ''}, parking, and the neighbours' upkeep.`);

  // 4. Shortlist item
  const sd = b.street?.ok ? b.street.data || {} : {};
  const s4 = n(sd.profile?.annual_4y), sub4 = n(sd.suburb_medians?.annual_4y);
  const short: ShortItem = {
    address, verdict, reds: rows.filter((r) => r.status === 'RED').length,
    streetGap: s4 !== null && sub4 !== null ? Number((s4 - sub4).toFixed(1)) : null, street4: s4, suburb4: sub4,
    ph: first(st('ph_area')?.summary || '', /([\d.]+)%/), yieldPct: first(st('yield')?.summary || '', /^([\d.]+)%/),
    vacancy: first(st('vacancy')?.summary || '', /^([\d.]+)%/), avmMid: mid
  };

  // 5. Offer
  const reds = short.reds;
  const haircut = Math.min(9, reds * 3);
  const likelyPct = q0 ? n(q0.median_deviation_pct) : null;
  return {
    enquire: { rec },
    message,
    inspect: look,
    short,
    offer: { avmLow: lo, avmMid: mid, avmHigh: hi, likelyPct, cohort: q0 ? String(q0.cohort || '') : '', haircut, comps: null }
  };
}

/** Walk-away ceiling: min(AVM high, comps median × 1.03) less 3% per red row (max 9%). */
export function ceilingOf(o: NextSteps['offer']): number | null {
  const caps = [o.avmHigh, o.comps !== null ? o.comps * 1.03 : null].filter((x): x is number => x !== null);
  if (!caps.length) return null;
  return Math.min(...caps) * (1 - o.haircut / 100);
}

export const METHOD_TIPS: Record<string, string> = {
  auction: 'Register to bid, bid confidently in round numbers, stop at your ceiling, and let the next bid go.',
  private: 'Offer in writing with a short expiry; start below the AVM mid-point; ask what the vendor will accept.',
  eoi: 'Put in one best offer by the deadline, with conditions that protect you (finance, building and pest).'
};

/** "Best on paper": fewest reds, then the biggest street-forecast gap, then yield. */
export function bestOf(items: ShortItem[]): { item: ShortItem; reason: string } | null {
  if (!items.length) return null;
  const s = [...items].sort((a, b) => a.reds - b.reds || (b.streetGap ?? -99) - (a.streetGap ?? -99) || (b.yieldPct ?? 0) - (a.yieldPct ?? 0));
  const best = s[0], next = s[1];
  const reason = !next ? 'it is the only one checked'
    : best.reds < next.reds ? `fewest red flags (${best.reds})`
    : (best.streetGap ?? -99) > (next.streetGap ?? -99) ? `its street forecast is strongest against its suburb (${best.streetGap! > 0 ? '+' : ''}${best.streetGap} pts)`
    : `higher rental yield (${best.yieldPct}%)`;
  return { item: best, reason };
}
