// NSW Planning Portal "Online DA Data API" (CC BY). Backfill 24 months in weekly windows, then nightly incremental
// (`make refresh-nightly` re-pulls the last 14 days by lodgement date and the last 14 days by DateLastUpdated is not
// filterable, so determined/status changes on older DAs refresh on the weekly full re-run of the last 90 days).
import { getJson } from '../lib/download.mjs';
import { q } from '../lib/db.mjs';
import { getCursor, setCursor, markDone, isDone } from '../lib/state.mjs';

export const SRC = 'da';
const API = 'https://api.apps1.nsw.gov.au/eplanning/data/v0/OnlineDA';
const BACKFILL_DAYS = Number(process.env.DA_BACKFILL_DAYS || 730);
const iso = (d) => d.toISOString().slice(0, 10);

async function fetchWindow(from, to) {
  let page = 1; let total = 0;
  for (;;) {
    const j = await getJson(API, { headers: { PageSize: '2000', PageNumber: String(page), filters: JSON.stringify({ filters: { LodgementDateFrom: from, LodgementDateTo: to } }) }, timeout: 180000 });
    const apps = j.Application || [];
    if (apps.length) await upsert(apps);
    total += apps.length;
    if (page >= (j.TotalPages || 1) || !apps.length) break;
    page++;
  }
  return total;
}

async function upsert(apps) {
  const vals = []; const params = [];
  apps.forEach((a, i) => {
    const loc = (a.Location || [])[0] || {};
    const x = Number(loc.X), y = Number(loc.Y);
    const k = i * 16;
    params.push(a.PlanningPortalApplicationNumber, a.Council?.CouncilName ?? null, a.CouncilApplicationNumber ?? null, a.ApplicationStatus ?? null, a.ApplicationType ?? null,
      a.LodgementDate || null, a.DeterminationDate || null, a.DateLastUpdated || null, a.CostOfDevelopment ?? null,
      (a.DevelopmentType || []).map((d) => d.DevelopmentType).filter(Boolean), a.DevelopmentDescription || null, loc.FullAddress || null, loc.Suburb || null, loc.Postcode || null,
      JSON.stringify(a), Number.isFinite(x) && Number.isFinite(y) ? `SRID=4326;POINT(${x} ${y})` : null);
    vals.push(`($${k + 1},$${k + 2},$${k + 3},$${k + 4},$${k + 5},$${k + 6}::date,$${k + 7}::date,$${k + 8}::timestamptz,$${k + 9},$${k + 10}::text[],$${k + 11},$${k + 12},$${k + 13},$${k + 14},$${k + 15}::jsonb,$${k + 16}::geography)`);
  });
  await q(`INSERT INTO da (pan, council, council_ref, status, app_type, lodged, determined, last_updated, cost, dev_types, description, address, suburb, postcode, props, geom)
           VALUES ${vals.join(',')}
           ON CONFLICT (pan) DO UPDATE SET status=EXCLUDED.status, determined=EXCLUDED.determined, last_updated=EXCLUDED.last_updated, cost=EXCLUDED.cost,
             dev_types=EXCLUDED.dev_types, description=EXCLUDED.description, address=EXCLUDED.address, suburb=EXCLUDED.suburb, postcode=EXCLUDED.postcode, props=EXCLUDED.props,
             geom=COALESCE(EXCLUDED.geom, da.geom)`, params);
}

export async function ingest() {
  const today = new Date();
  // 1. backfill (resumable by window cursor)
  if (!(await isDone(SRC, 'backfill'))) {
    const start = new Date(today.getTime() - BACKFILL_DAYS * 86400000);
    const cur = (await getCursor(SRC, 'backfill')) || { from: iso(start) };
    let from = new Date(cur.from);
    let total = 0;
    while (from <= today) {
      const to = new Date(Math.min(from.getTime() + 6 * 86400000, today.getTime()));
      const n = await fetchWindow(iso(from), iso(to));
      total += n;
      console.log(`  DA ${iso(from)}..${iso(to)}: ${n}`);
      from = new Date(to.getTime() + 86400000);
      await setCursor(SRC, 'backfill', { from: iso(from) }, `${total} so far`);
    }
    await markDone(SRC, 'backfill', `${total} applications`);
  }
  // 2. incremental: always re-pull the last 14 days (status/determination updates on recent lodgements).
  const from = new Date(today.getTime() - 14 * 86400000);
  const n = await fetchWindow(iso(from), iso(today));
  console.log(`  DA incremental ${iso(from)}..${iso(today)}: ${n}`);
  await setCursor(SRC, 'incremental', { last: iso(today) }, `${n} in last 14 days`);
  await q('ANALYZE da');
}
