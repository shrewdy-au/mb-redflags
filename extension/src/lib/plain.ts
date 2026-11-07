// Plain English view: deterministic templates (no LLM). Built from the rows plus a few raw numbers in the bundle.
import type { Bundle } from './rules';
import type { Plain, Row, Verdict } from './types';

const WORDS: Record<Verdict, string> = { GO: 'Worth a look', INVESTIGATE: 'Look closer first', 'NO-GO': 'Walk away for now' };
const n = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && /-?\d/.test(v) ? Number(v.match(/-?\d+(?:\.\d+)?/)![0]) : null);
const $ = (v: number | null) => (v === null ? '?' : `$${Math.round(v).toLocaleString('en-AU')}`);
const first = (s: string, re: RegExp) => { const m = s.match(re); return m ? Number(m[1]) : null; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const NUM = ['', 'One', 'Two', 'Three'];

/** Short "why" phrase per flagged row. */
function phrase(r: Row): string {
  const s = r.summary;
  switch (r.id) {
    case 'ph_area': { const p = first(s, /([\d.]+)%/); return p ? `about 1\u00a0in\u00a0${Math.max(2, Math.round(100 / p))} homes around here are public housing` : 'a lot of homes around here are public housing'; }
    case 'ph_200': return s.startsWith('this address') ? 'this home itself looks like public housing' : `${first(s, /\(([\d.]+)%\)/) ?? 'many'}% of homes within 200 m are flagged as public housing`;
    case 'street': return "this street's prices are forecast to grow slower than the suburb";
    case 'flood': case 'historical_flood': return s.includes('on property') ? 'the land is mapped as flood-prone' : 'flood-prone land is close by';
    case 'bushfire': return 'the land is bushfire-prone';
    case 'environment': return 'there is contamination on or near the site';
    case 'erosion': case 'landslide': return `the ground has a ${r.id} risk`;
    case 'hv_power_line': return 'a high-voltage power line runs close by';
    case 'heritage': return 'the house is under a heritage listing';
    case 'avm': return 'the asking price is well above the computer estimate';
    case 'quoting': return 'this agency tends to quote below the final price';
    case 'investor': return 'most homes here are owned by investors';
    case 'mortgage_stress': return 'many owners nearby are under mortgage stress';
    case 'vacancy': return 'a lot of rentals are sitting empty';
    case 'das': return 'there is building work planned right next door';
    case 'anef': return 'it sits under the aircraft-noise zone';
    case 'mobile_black_spot': return 'phone reception is poor';
    case 'yield': return 'rent is low for the price';
    default: return r.label.toLowerCase();
  }
}

/** "What this means for you" per row id. */
function means(r: Row, b: Bundle): string | undefined {
  const s = r.summary;
  switch (r.id) {
    case 'flood': case 'historical_flood': return r.status === 'GREEN' ? undefined : 'Insurance can cost more and some banks lend less on flood land. Ask for the flood certificate.';
    case 'bushfire': return r.status === 'GREEN' ? undefined : 'Building rules (BAL) make renovations dearer; insurance too.';
    case 'environment': return r.status === 'GREEN' ? undefined : "Old industry nearby; a clean-up can be the buyer's problem.";
    case 'hv_power_line': return r.status === 'GREEN' ? undefined : "Some buyers won't live under power lines, so it can be harder to sell.";
    case 'heritage': return r.status === 'GREEN' ? undefined : 'You may not be able to change the front, windows or roof without council.';
    case 'ph_area': case 'ph_200': return r.status === 'GREEN' ? undefined : "Fewer owner-occupiers compete when you sell. It's about who's bidding, not about neighbours.";
    case 'street': {
      const d = b.street?.ok ? b.street.data || {} : {};
      const st = n(d.profile?.annual_4y), sub = n(d.suburb_medians?.annual_4y), price = n(d.profile?.current_price);
      if (st === null || sub === null || price === null) return undefined;
      const diff = (price * (sub - st)) / 100;
      return diff > 0
        ? `If the suburb grows ${sub}%/yr and this street ${st}%/yr, on a ${$(price)} home that's about ${$(diff)}/yr less.`
        : `This street is forecast at ${st}%/yr against the suburb's ${sub}%/yr: about ${$(-diff)}/yr more on a ${$(price)} home.`;
    }
    case 'avm': { const p = b.avm?.ok ? n(b.avm.data?.predicted_price) : null; return p ? `Microburbs' computer price guess is ${$(p)}. A guide far above it is a warning.` : undefined; }
    case 'quoting': {
      const q = b.quoting?.ok ? b.quoting.data || {} : null;
      if (!q) return undefined;
      const dev = n(q.median_deviation_pct), likely = n(q.likely_sale_price);
      return dev !== null ? `This agency's past guides ran ${dev}% under the sale price; budget ${likely ? $(likely) : `about ${dev}% over the guide`}, not the guide.` : undefined;
    }
    case 'das': { const k = first(s, /^(\d+) within/), near = r.distance_m; return k !== null ? `${k} building projects within 300 m: expect noise, and check what's going up ${near != null ? `${Math.round(near)} m` : 'nearest'} away.` : undefined; }
    case 'investor': { const p = first(s, /^([\d.]+)%/); return p !== null ? `${p}% of homes here are rentals: fewer families competing to buy, more renters as neighbours.` : undefined; }
    case 'mortgage_stress': { const v = first(s, /score (\d+)/); return v !== null ? `Score ${v}/100: higher means more forced sales nearby, which can drag prices.` : undefined; }
    case 'vacancy': { const v = first(s, /^([\d.]+)%/); return v !== null ? `${v}% of rentals are empty: under 2% means tenants are easy to find.` : undefined; }
    case 'yield': { const y = first(s, /^([\d.]+)%/); return y !== null ? `Rent covers about ${y}% of the price each year, before costs.` : undefined; }
    case 'neg_gearing': {
      const g = b.negGearing?.ok ? b.negGearing.data || {} : null;
      if (!g) return undefined;
      if (g.rent_estimate_suspect) return "The rent estimate for this home looks unreliable, so we can't say what it would cost you each week.";
      const wk = n(g.net_cashflow_80lvr_wk);
      return wk === null ? undefined : wk < 0 ? `At 80% borrowed you'd tip in about ${$(-wk)} a week after rent.` : `At 80% borrowed the rent would cover the costs, with about ${$(wk)} a week left over.`;
    }
    case 'max_height': {
      const h = first(s, /Max height ([\d.]+) m/), code = (s.split('·')[1] || '').trim().split(' ')[0];
      return h !== null ? `Zone ${code || '?'}: up to ${h} m can be built next door, so views and light can change.` : undefined;
    }
    case 'affordability': return `How stretched local incomes are against prices (${s}). Higher means easier to afford.`;
    case 'council_rates': return `Council charges about ${s.replace(/\/yr average/, '')} a year here.`;
    case 'insurance': return `If you rent it out, landlord insurance costs about ${s.replace(/^~/, '').replace(/ median.*$/, '')}.`;
    case 'tenure': return `${s}: the higher the renter share, the fewer owner-occupiers live here.`;
    case 'median_price': return `What houses typically sell for on this block compared with the suburb: ${s}.`;
    case 'anef': return r.status === 'GREY' ? undefined : 'Planes overhead: check the airport noise map.';
    default: return undefined;
  }
}

export const GLOSSARY: Record<string, string> = {
  avm: 'AVM: a computer\'s estimate of the price, not a valuation.',
  ph_area: 'SA1: a Census block of about 400 people.',
  max_height: 'HOB: the tallest building allowed. FSR: how much floor space can be built per square metre of land.',
  anef: 'ANEF: the aircraft-noise contour map.',
  das: 'DA: an application to build or demolish.',
  tenure: 'Mesh block: the smallest Census area, about 30–60 homes.',
  median_price: 'Mesh block: the smallest Census area, about 30–60 homes.',
  investor: 'Mesh block: the smallest Census area, about 30–60 homes.',
  mortgage_stress: 'Mesh block: the smallest Census area, about 30–60 homes.',
  street: 'Forecast: a model\'s guess at yearly price growth, not a promise.',
  quoting: 'Underquoting: advertising a price guide below what the seller expects.',
  neg_gearing: 'Negative gearing: when rent doesn\'t cover the loan and costs, so you pay the gap.',
  yield: 'Gross yield: a year\'s rent as a share of the price.',
  vacancy: 'Vacancy rate: the share of rentals with no tenant.',
  heritage: 'Heritage overlay: council protection on how a building looks.',
  ph_200: 'Flagged: homes Microburbs thinks are likely public housing.'
};

export function plainOf(rows: Row[], verdict: Verdict, b: Bundle): Plain {
  const reds = rows.filter((r) => r.status === 'RED');
  const ambers = rows.filter((r) => r.status === 'AMBER');
  const clearIds: Array<[string, string]> = [['flood', 'flood'], ['bushfire', 'bushfire'], ['environment', 'contamination']];
  const clear = clearIds.filter(([id]) => rows.find((r) => r.id === id)?.status === 'GREEN').map(([, w]) => w);
  const parts: string[] = [];
  const r2 = reds.slice(0, 2).map(phrase);
  if (r2.length) parts.push(`${NUM[r2.length]} thing${r2.length > 1 ? 's' : ''} would worry a careful buyer: ${r2.join(', and ')}.`);
  if (ambers[0]) parts.push(r2.length ? `Also check: ${phrase(ambers[0])}.` : `One thing to check: ${phrase(ambers[0])}.`);
  if (!r2.length && !ambers.length) parts.push('Nothing in the mapped data would worry a careful buyer.');
  if (clear.length) parts.push(`${cap(list(clear))} ${clear.length > 1 ? 'are' : 'is'} clear.`);
  const m: Record<string, string> = {};
  for (const r of rows) { const t = means(r, b); if (t) m[r.id] = t; }

  // Questions for the agent, from the flags in a fixed priority.
  const q: string[] = [];
  const st = (id: string) => rows.find((r) => r.id === id);
  const flagged = (id: string) => ['RED', 'AMBER'].includes(st(id)?.status || '');
  if (flagged('heritage')) q.push("What can't I change on this house?");
  const da = st('das'); if (da && da.status !== 'GREY' && da.distance_m != null) q.push(`What is being built ${Math.round(da.distance_m)} m away?`);
  if (/underquot/i.test(st('quoting')?.summary || '') || flagged('quoting')) q.push('What did your last five similar sales sell for versus the guide?');
  if (flagged('flood') || flagged('historical_flood')) q.push('Can I see the s10.7 certificate and flood level?');
  if (flagged('ph_area') || flagged('ph_200')) q.push('How many owner-occupiers bought on this street in the last 2 years?');
  if (q.length < 3) q.push('What would make you walk away from this property?');

  // Would it pay for itself?
  const g = b.negGearing?.ok ? b.negGearing.data || {} : null;
  const y = first(st('yield')?.summary || '', /^([\d.]+)%/), v = first(st('vacancy')?.summary || '', /^([\d.]+)%/);
  let pay: string | undefined;
  if (g || (y !== null && v !== null)) {
    const wk = g ? n(g.net_cashflow_80lvr_wk) : null;
    const a = !g ? '' : g.rent_estimate_suspect ? 'weekly cost unknown (rent estimate unreliable)' : wk === null ? '' : wk < 0 ? `${$(-wk)}/week out of pocket at 80% borrowed` : `${$(wk)}/week ahead at 80% borrowed`;
    pay = [a, y !== null ? `rent ${y}% of price` : '', v !== null ? `${v}% of rentals vacant` : ''].filter(Boolean).join(' · ');
  }

  // How sure is this?
  const sd = b.street?.ok ? b.street.data?.profile || {} : {};
  const conf = String(sd.confidence || ''), sales = n(sd.n_sales) ?? 0;
  const withData = rows.filter((r) => r.status !== 'GREY').length;
  const frac = rows.length ? withData / rows.length : 0;
  const level = /^high/i.test(conf) && sales >= 30 && frac >= 0.85 ? 'High' : /^low/i.test(conf) || sales < 10 || frac < 0.6 ? 'Low' : 'Medium';
  const sure = `${level}: street model confidence ${conf || 'unknown'} on ${sales} sales; ${withData} of ${rows.length} checks returned data.`;

  return { words: WORDS[verdict], why: parts.join(' '), means: m, questions: q.slice(0, 3), pay, sure };
}
