// TfNSW "Timetables - Complete - GTFS" (Open Data Hub, CC BY 4.0). The static zip is public; the API key is only
// needed for the realtime feeds. Loads stops + the modes serving each stop (routes -> trips -> stop_times, streamed).
import { createInterface } from 'node:readline';
import { download, unzipStream, unzipList } from '../lib/download.mjs';
import { q } from '../lib/db.mjs';
import { step } from '../lib/state.mjs';

export const SRC = 'gtfs';
const URL = 'https://opendata.transport.nsw.gov.au/data/dataset/d1f68d4f-b778-44df-9823-cf2fa922e47f/resource/67974f14-01bf-47b7-bfa5-c7f2f8a950ca/download/full_greater_sydney_gtfs_static_0.zip';

function splitCsv(line) {
  const out = []; let cur = ''; let inq = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inq && line[i + 1] === '"') { cur += '"'; i++; } else inq = !inq; }
    else if (ch === ',' && !inq) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
async function* rows(zip, member) {
  let header = null;
  for await (const line of createInterface({ input: unzipStream(zip, member), crlfDelay: Infinity })) {
    if (!line) continue;
    const c = splitCsv(line.replace(/^﻿/, ''));
    if (!header) { header = c; continue; }
    yield Object.fromEntries(header.map((h, i) => [h, c[i]]));
  }
}
// GTFS route_type (standard + Google extended) -> mode the extension shows.
export function modeOf(t) {
  const n = Number(t);
  if (n === 0 || (n >= 900 && n <= 999)) return 'tram';
  if (n === 1 || n === 2 || (n >= 100 && n <= 199) || (n >= 400 && n <= 499)) return 'train';
  if (n === 3 || (n >= 200 && n <= 299) || (n >= 700 && n <= 799)) return 'bus';
  if (n === 4 || (n >= 1000 && n <= 1099) || n === 1200) return 'ferry';
  return 'other';
}

export async function ingest() {
  const zip = await download(URL, 'gtfs', 'full_greater_sydney_gtfs_static.zip', { minBytes: 200_000_000 });
  const members = await unzipList(zip);
  const m = (n) => members.find((x) => x === n || x.endsWith('/' + n));
  await step(SRC, 'stops + modes', async () => {
    const routeMode = new Map();
    for await (const r of rows(zip, m('routes.txt'))) routeMode.set(r.route_id, modeOf(r.route_type));
    const tripMode = new Map();
    for await (const r of rows(zip, m('trips.txt'))) tripMode.set(r.trip_id, routeMode.get(r.route_id) || 'other');
    const stopModes = new Map();
    let n = 0;
    for await (const r of rows(zip, m('stop_times.txt'))) {
      const mode = tripMode.get(r.trip_id); if (!mode) continue;
      let s = stopModes.get(r.stop_id); if (!s) { s = new Set(); stopModes.set(r.stop_id, s); }
      s.add(mode);
      if (++n % 5_000_000 === 0) console.log(`  stop_times ${n}`);
    }
    const stops = [];
    const parentModes = new Map();
    for await (const r of rows(zip, m('stops.txt'))) {
      const lat = Number(r.stop_lat), lon = Number(r.stop_lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const modes = [...(stopModes.get(r.stop_id) || [])];
      stops.push({ id: r.stop_id, name: r.stop_name, parent: r.parent_station || null, lt: Number(r.location_type || 0), plat: r.platform_code || null, modes, lat, lon });
      if (r.parent_station) { let s = parentModes.get(r.parent_station); if (!s) { s = new Set(); parentModes.set(r.parent_station, s); } modes.forEach((x) => s.add(x)); }
    }
    for (const s of stops) if (s.lt === 1) s.modes = [...new Set([...s.modes, ...(parentModes.get(s.id) || [])])];
    await q('TRUNCATE gtfs_stop');
    for (let i = 0; i < stops.length; i += 1500) {
      const b = stops.slice(i, i + 1500);
      const vals = []; const params = [];
      b.forEach((s, j) => {
        const k = j * 7;
        params.push(s.id, s.name, s.parent, s.lt, s.plat, s.modes, `SRID=4326;POINT(${s.lon} ${s.lat})`);
        vals.push(`($${k + 1},$${k + 2},$${k + 3},$${k + 4},$${k + 5},$${k + 6}::text[],$${k + 7}::geography)`);
      });
      await q(`INSERT INTO gtfs_stop (stop_id, stop_name, parent_station, location_type, platform_code, modes, geom) VALUES ${vals.join(',')} ON CONFLICT (stop_id) DO NOTHING`, params);
    }
    await q('ANALYZE gtfs_stop');
    return `${stops.length} stops, ${n} stop_times scanned`;
  });
}
