// Open-data answers for the Microburbs-shaped paths the extension already parses.
// handle(pathname, params) -> { status, body } | null (null = not an open-data route, proxy passes it to Microburbs).
// Envelope: { data } or { data: null, available: false, reason, message }. Every answer names its sources (CC BY attribution).
import { q, one } from './lib/db.mjs';
import { getJson } from './lib/download.mjs';

const RADIUS = 1000;
const ok = (data, extra = {}) => ({ status: 200, body: { data, ...extra } });
const unavailable = (reason, message) => ({ status: 200, body: { data: null, available: false, reason, message } });
const notFound = (message) => ({ status: 404, body: { detail: message } });
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const round = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const bare = (s) => String(s || '').replace(/\s*\(.*\)\s*$/, '').trim();

export const ATTRIBUTION = {
  gnaf: '© Geoscape Australia / PSMA, G-NAF Aug 2026 (CC BY 4.0, open G-NAF EULA)',
  abs: 'Australian Bureau of Statistics, ASGS Edition 3 and Census 2021 (CC BY 4.0)',
  eplanning: 'NSW Department of Planning, Housing and Infrastructure, ePlanning spatial data (CC BY 4.0)',
  rfs: 'NSW Rural Fire Service 2025, Bush Fire Prone Land (CC BY)',
  spatial: '© Spatial Services, NSW Department of Customer Service (CC BY 4.0)',
  epa: 'NSW Environment Protection Authority, Contaminated Sites (CC BY)',
  seed: 'NSW Department of Climate Change, Energy, the Environment and Water, NSW Coastal Erosion 2025 (CC BY 4.0)',
  da: 'NSW Planning Portal Online DA Data API (CC BY)',
  rdh: 'Regional Data Hub (DITRDCA), Census Mortgage and Rent Affordability Indicators 2021 (CC BY)',
  ato: 'Australian Taxation Office, Taxation Statistics 2023-24 Table 25 (CC BY 2.5 AU)',
  bonds: 'NSW Fair Trading rental bond lodgement data (CC BY)',
  tfnsw: 'Transport for NSW, Timetables Complete GTFS (CC BY 4.0)'
};

// ---------- helpers ----------
async function addr(gnaf) {
  return one(`SELECT a.*, ST_X(a.geom::geometry) lon, ST_Y(a.geom::geometry) lat, m.sa1_code, m.sa2_code, m.sa2_name, m.sa3_name, m.sa4_name,
                     m.gccsa_name, m.sal_name, m.lga_name, m.state_name
              FROM address a LEFT JOIN asgs_mb m ON m.mb_code = a.mb_2021 WHERE a.gnaf_pid = $1`, [gnaf]);
}
async function salOf(name) {
  const exact = await one(`SELECT sal_name FROM asgs_mb WHERE sal_name = $1 LIMIT 1`, [name]);
  if (exact) return exact.sal_name;
  const b = bare(name).toLowerCase();
  const r = await one(`SELECT sal_name FROM asgs_mb WHERE lower(regexp_replace(sal_name, '\\s*\\(.*\\)\\s*$', '')) = $1 AND state_code = '1' GROUP BY sal_name ORDER BY count(*) DESC LIMIT 1`, [b]);
  return r?.sal_name ?? null;
}
async function hullOf(kind, code) {
  const r = await one('SELECT ST_AsGeoJSON(geom) g FROM area_hull WHERE kind=$1 AND code=$2', [kind, code]);
  return r ? r.g : null;
}
async function cached(key, ttlHours, fn) {
  const hit = await one('SELECT body FROM api_cache WHERE key=$1 AND computed_at > now() - ($2 || \' hours\')::interval', [key, String(ttlHours)]);
  if (hit) return hit.body;
  const body = await fn();
  await q('INSERT INTO api_cache(key, body, computed_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET body=EXCLUDED.body, computed_at=now()', [key, JSON.stringify(body)]);
  return body;
}
async function sourceCount(source) {
  const r = await one('SELECT count(*)::int n FROM features WHERE source=$1', [source]);
  return r.n;
}

/** Features of `source` within RADIUS of the point: on-property flag, nearest distance, count, optional clipped GeoJSON. */
async function near(source, lon, lat, { geojson = false, radius = RADIUS, limit = geojson ? 300 : 60 } = {}) {
  const total = (await one(`SELECT count(*)::int n FROM features f WHERE f.source = $1 AND ST_DWithin(f.geom::geography, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $4)`, [source, lon, lat, radius])).n;
  const rows = total === 0 ? [] : (await q(`
    WITH p AS (SELECT ST_SetSRID(ST_MakePoint($2,$3),4326) g)
    SELECT f.fid, f.props, ST_Intersects(f.geom, p.g) AS on_prop, ST_Distance(f.geom::geography, p.g::geography) AS d
           ${geojson ? ', ST_AsGeoJSON(ST_Intersection(f.geom, ST_Buffer(p.g::geography, $4)::geometry), 6) gj' : ''}
    FROM features f, p
    WHERE f.source = $1 AND ST_DWithin(f.geom::geography, p.g::geography, $4)
    ORDER BY on_prop DESC, d ASC LIMIT $5`, [source, lon, lat, radius, limit])).rows;
  const top = rows[0];
  return {
    rows, top, count: total,
    on_property: !!top?.on_prop, nearest_m: top ? Math.round(Number(top.d)) : null,
    fc: geojson ? { type: 'FeatureCollection', features: rows.filter((r) => r.gj).map((r) => ({ type: 'Feature', properties: { ...r.props, distance_m: Math.round(Number(r.d)) }, geometry: JSON.parse(r.gj) })) } : undefined
  };
}
function riskRow(spec, n, valueOf) {
  const on = n.on_property;
  const row = { area_level: 'Layer', area_name: spec.label, name: spec.name, on_property: on, nearest_distance_m: on ? 0 : n.nearest_m,
    search_radius_m: RADIUS, features_within_radius: n.count, assessed: true, source: spec.source, licence: spec.licence,
    value: n.top ? (on ? `On property${valueOf ? ': ' + valueOf(n.top.props) : ''}` : `Not on property; nearest ${n.nearest_m} m away${valueOf ? ' (' + valueOf(n.top.props) + ')' : ''}`) : `None within ${RADIUS} m` };
  if (n.fc) row.geojson = n.fc;
  return row;
}
const notAssessed = (name, label, why, source) => ({ area_level: 'Layer', area_name: label, name, on_property: false, nearest_distance_m: null, search_radius_m: RADIUS,
  assessed: false, value: `Not assessed: ${why}`, source });

// ---------- lots (live Spatial Services fetch, cached) ----------
async function lotAt(lon, lat) {
  const hit = await one('SELECT cadid, lotidstring, props, ST_AsGeoJSON(geom) g FROM lot_cache WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) LIMIT 1', [lon, lat]);
  if (hit) return hit;
  const u = new URL('https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer/8/query');
  u.search = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'cadid,lotidstring,planlabel,lotnumber,sectionnumber,planlotarea,planlotareaunits,hasstratum,stratumlevel', outSR: '4326', f: 'geojson' }).toString();
  let j; try { j = await getJson(u.toString(), { timeout: 8000, retries: 1 }); } catch { return null; }
  const f = (j.features || []).find((x) => x.geometry && (x.properties?.stratumlevel ?? 0) === 0) || (j.features || [])[0];
  if (!f) return null;
  const p = f.properties || {};
  await q(`INSERT INTO lot_cache (cadid, lotidstring, props, geom) VALUES ($1,$2,$3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4),4326)))
           ON CONFLICT (cadid) DO UPDATE SET props=EXCLUDED.props, geom=EXCLUDED.geom, fetched_at=now()`, [String(p.cadid), p.lotidstring ?? null, JSON.stringify(p), JSON.stringify(f.geometry)]);
  return { cadid: String(p.cadid), lotidstring: p.lotidstring, props: p, g: JSON.stringify(f.geometry) };
}
async function easementRow(lon, lat, geojson) {
  const lot = await lotAt(lon, lat);
  const n = await near('easements', lon, lat, { geojson });
  if (!lot) return { ...riskRow({ label: 'Easements (Spatial Services)', name: 'Easement', source: 'spatial_services_easement', licence: 'CC BY 4.0' }, n, (p) => p.easementtype || 'easement'), lot: null, note: 'lot polygon unavailable; point-based only' };
  const hit = await q(`SELECT props FROM features f WHERE source='easements' AND ST_Intersects(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1),4326))`, [lot.g]);
  const types = [...new Set(hit.rows.map((r) => r.props.easementtype).filter(Boolean))];
  return { area_level: 'Lot', area_name: 'Easements (Spatial Services)', name: 'Easement', on_property: hit.rows.length > 0, nearest_distance_m: hit.rows.length ? 0 : n.nearest_m,
    search_radius_m: RADIUS, features_within_radius: n.count, assessed: true, source: 'spatial_services_easement', licence: 'CC BY 4.0',
    value: hit.rows.length ? `${hit.rows.length} easement${hit.rows.length > 1 ? 's' : ''} intersect lot ${lot.lotidstring || lot.cadid}${types.length ? ' (' + types.join(', ') + ')' : ''}` : `No easement on lot ${lot.lotidstring || lot.cadid}${n.top ? `; nearest ${n.nearest_m} m away` : ''}`,
    lot: { cadid: lot.cadid, lotidstring: lot.lotidstring, area_m2: num(lot.props?.planlotarea) }, ...(n.fc ? { geojson: n.fc } : {}) };
}

// ---------- ANEF / ANEC ----------
const anefMid = (code) => { const m = String(code || '').match(/(\d+)\s*-\s*(\d+)/); return m ? (Number(m[1]) + Number(m[2])) / 2 : (String(code || '').match(/(\d+)/) ? Number(RegExp.$1) : null); };
async function anefAt(lon, lat, lga) {
  const here = await q(`SELECT source, props FROM features WHERE source IN ('epi_anef','wsa_anec') AND ST_Intersects(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) ORDER BY source DESC`, [lon, lat]);
  const vals = here.rows.map((r) => anefMid(r.props.ANEF_CODE)).filter((v) => v !== null);
  const val = vals.length ? Math.max(...vals) : null;
  // "assessed" = this LGA has an LEP ANEF map, or the point is within 15 km of the Western Sydney Airport ANEC map.
  const lep = await one(`SELECT 1 FROM features WHERE source='epi_anef' AND upper(props->>'LGA_NAME') = upper($1) LIMIT 1`, [bare(lga || '')]);
  const wsa = await one(`SELECT 1 FROM features WHERE source='wsa_anec' AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 15000) LIMIT 1`, [lon, lat]);
  return { assessed: !!(lep || wsa || val !== null), value: val, source: here.rows[0]?.source || (wsa ? 'wsa_anec' : lep ? 'epi_anef' : null) };
}

// ---------- routes ----------
async function geocode(params) {
  const raw = String(params.get('address') || '').trim();
  if (!raw) return { status: 422, body: { detail: 'address required' } };
  const s = raw.toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const pc = (s.match(/\b(\d{4})\b\s*$/) || [])[1] || null;
  let core = s.replace(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b\s*(\d{4})?\s*$/, '').trim();
  let unit = null, number = null;
  let m = core.match(/^(?:UNIT|APT|APARTMENT|FLAT|SHOP|SUITE|LOT)?\s*([\w-]+)\s*\/\s*(\d+[A-Z]?)(?:-\d+[A-Z]?)?\s+(.*)$/);
  if (m) { unit = m[1]; number = m[2]; core = m[3]; }
  else { m = core.match(/^(\d+[A-Z]?)(?:-\d+[A-Z]?)?\s+(.*)$/); if (m) { number = m[1]; core = m[2]; } }
  const qtext = `${number || ''} ${core} ${pc || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const where = [`search_text % $1`]; const args = [qtext];
  if (number) { args.push(number); where.push(`number_first = $${args.length}`); }
  if (pc) { args.push(pc); where.push(`(postcode = $${args.length} OR postcode IS NULL)`); }
  const SEL = `SELECT gnaf_pid, abbr, flat_number, number_first, street_name, street_type, locality, postcode, ST_X(geom::geometry) lon, ST_Y(geom::geometry) lat, similarity(search_text, $1) s FROM address`;
  let rows = [];
  if (unit) { // exact unit first ("3/12 Raglan St" must not land on the house at 12)
    rows = (await q(`${SEL} WHERE ${where.join(' AND ')} AND upper(flat_number) = $${args.length + 1} ORDER BY s DESC LIMIT 25`, [...args, unit])).rows;
  }
  // then the general matches (the house at the same number, neighbours), so the extension's scorer still has a fallback
  const general = (await q(`${SEL} WHERE ${where.join(' AND ')} ORDER BY s DESC LIMIT 25`, args)).rows;
  rows = [...rows, ...general.filter((g) => !rows.some((r) => r.gnaf_pid === g.gnaf_pid))];
  if (!rows.length && number) rows = (await q(`${SEL} WHERE number_first = $2 AND search_text % $1 ORDER BY s DESC LIMIT 25`, [qtext, number])).rows;
  if (unit) rows.sort((a, b) => (String(b.flat_number || '').toUpperCase() === unit ? 1 : 0) - (String(a.flat_number || '').toUpperCase() === unit ? 1 : 0) || b.s - a.s);
  else rows.sort((a, b) => (a.flat_number ? 1 : 0) - (b.flat_number ? 1 : 0) || b.s - a.s); // house query: houses before units
  const title = (t) => t ? t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '';
  return ok(rows.slice(0, 10).map((r) => ({
    id: r.gnaf_pid, abbr: r.abbr, name: r.abbr,
    display_name: `${r.flat_number ? r.flat_number + '/' : ''}${r.number_first} ${title(r.street_name)} ${title(r.street_type)}, ${title(r.locality)} NSW ${r.postcode || ''}`.replace(/\s+,/, ',').trim(),
    property_type: r.flat_number ? 'unit' : 'house', lat: r.lat, lng: r.lon, score: round(r.s, 3)
  })), { source: ATTRIBUTION.gnaf });
}

async function profile(a) {
  return ok({
    gnaf_pid: a.gnaf_pid, address: a.abbr, gccsa: a.gccsa_name, lga: bare(a.lga_name), lga_full: a.lga_name, mesh_block: a.mb_2021, postcode: a.postcode,
    sa1: a.sa1_code, sa2: a.sa2_name, sa2_code: a.sa2_code, sa3: a.sa3_name, sa4: a.sa4_name, state: 'NSW', suburb: a.sal_name,
    lat: a.lat, lng: a.lon, center_lat: a.lat, center_lng: a.lon, legal_parcel_id: a.legal_parcel_id, gnaf_confidence: a.confidence
  }, { source: `${ATTRIBUTION.gnaf}; ${ATTRIBUTION.abs}` });
}

const HAZARDS = [
  { key: 'flood', source: 'epi_flood', label: 'Flood planning area (LEP/SEPP)', name: 'Flood', licence: 'CC BY 4.0', lgaGated: true, valueOf: (p) => p.LAY_CLASS || p.EPI_NAME },
  { key: 'bushfire', source: 'rfs_bfpl', label: 'Bush fire prone land (NSW RFS)', name: 'Bushfire', licence: 'CC BY', valueOf: (p) => p.d_category || `category ${p.category}` },
  { key: 'erosion', source: 'coastal_erosion', label: 'Coastal erosion 2025 (DCCEEW)', name: 'Erosion', licence: 'CC BY 4.0' },
  { key: 'landslide', source: 'epi_landslide', label: 'Landslide risk land (LEP)', name: 'Landslide', licence: 'CC BY 4.0', lgaGated: true, valueOf: (p) => p.LAY_CLASS },
  { key: 'environment', source: 'epa_contaminated', label: 'EPA contaminated sites (notified)', name: 'Contamination', licence: 'CC BY', point: true, valueOf: (p) => `${p.sitename || ''}${p.contaminationactivitytype ? ' · ' + p.contaminationactivitytype : ''}${p.managementclass ? ' · ' + String(p.managementclass).trim() : ''}` },
  { key: 'heritage', source: 'epi_heritage', label: 'Heritage (LEP)', name: 'Heritage', licence: 'CC BY 4.0', valueOf: (p) => `${p.H_NAME || 'heritage item/area'}${p.SIG ? ' · ' + p.SIG : ''}` },
  { key: 'acid_sulfate', source: 'epi_ass', label: 'Acid sulfate soils class (LEP)', name: 'Acid sulfate soils', licence: 'CC BY 4.0', valueOf: (p) => p.LAY_CLASS },
  { key: 'mine_subsidence', source: 'mine_subsidence', label: 'Mine subsidence district (Spatial Services)', name: 'Mine subsidence', licence: 'CC BY 4.0', valueOf: (p) => p.districtname },
  { key: 'busy_road', source: 'busy_roads', label: 'Busy road (Spatial Services road hierarchy 1-4)', name: 'Busy road', licence: 'CC BY 4.0', valueOf: (p) => `${p.roadnamebase || ''} ${p.roadnametype || ''} (hierarchy ${p.functionhierarchy})`.trim() }
];
const HIER = { 1: 'motorway', 2: 'primary road', 3: 'arterial road', 4: 'sub-arterial road' };

async function risksAll(a, params) {
  const geojson = params.get('geojson') === 'true';
  const out = {};
  const lgaUpper = bare(a.lga_name).toUpperCase();
  for (const h of HAZARDS) {
    if (h.lgaGated) {
      const cov = await one(`SELECT 1 FROM features WHERE source=$1 AND upper(props->>'LGA_NAME') = $2 LIMIT 1`, [h.source, lgaUpper]);
      const sepp = h.key === 'flood' ? await one(`SELECT 1 FROM features WHERE source='epi_flood' AND coalesce(props->>'LGA_NAME','') = '' AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 3000) LIMIT 1`, [a.lon, a.lat]) : null;
      if (!cov && !sepp) { out[h.key] = [notAssessed(h.name, h.label, `no ${h.name.toLowerCase()} layer for ${bare(a.lga_name)} in the ePlanning EPI dataset (council flood/landslide studies are not CC BY)`, h.source)]; continue; }
    }
    const n = await near(h.source, a.lon, a.lat, { geojson });
    if (h.point && n.top && !n.on_property && n.nearest_m <= 30) { n.on_property = true; } // EPA sites are points; within 30 m counts as on the property
    const row = riskRow(h, n, h.valueOf);
    if (h.key === 'busy_road' && n.top) row.value = `${n.top.props.roadnamebase || ''} ${n.top.props.roadnametype || ''}`.trim() + ` (${HIER[n.top.props.functionhierarchy] || 'busy road'}) ${n.nearest_m} m away`;
    // Microburbs convention the extension already renders: an assessed layer with nothing inside the search radius is an empty list.
    out[h.key] = n.count === 0 ? [] : [row];
  }
  out.historical_flood = [notAssessed('Historically Flooded', 'Historical flood', 'no CC BY source for historical flood extents (NSW Flood Data Portal studies carry agency-specific licences)', null)];
  out.hv_power_line = [notAssessed('High Voltage Power Line', 'HV power line', 'not loaded in phase 1 (Geoscience Australia transmission lines, CC BY 4.0, is the candidate source)', null)];
  out.mobile_black_spot = [notAssessed('Mobile Black Spot', 'Mobile black spot', 'no open address-level source', null)];
  // Public housing: Census 2021 G37 share of occupied private dwellings rented from the state housing authority, at SA1.
  const c = a.sa1_code ? await one('SELECT * FROM census_sa1 WHERE sa1_code=$1', [a.sa1_code]) : null;
  if (c && Number(c.total_occ_private) > 0) {
    const pct = round((Number(c.rented_state_housing) / Number(c.total_occ_private)) * 100, 1);
    out.public_housing = [{ area_level: 'SA1', area_name: `SA1 ${a.sa1_code}`, name: 'Public Housing', on_property: true, nearest_distance_m: 0, search_radius_m: RADIUS,
      value: `${pct}%`, pct, dwellings: Number(c.total_occ_private), state_housing_dwellings: Number(c.rented_state_housing), assessed: true, source: 'abs_census_2021_g37', licence: 'CC BY 4.0',
      note: 'share of occupied private dwellings in this SA1 rented from the state housing authority (Census 2021); not an address-level flag' }];
  } else out.public_housing = [notAssessed('Public Housing', 'Public housing (SA1)', 'no Census SA1 for this address', 'abs_census_2021_g37')];
  // ANEF / ANEC
  const an = await anefAt(a.lon, a.lat, a.lga_name);
  out.aircraft_noise = [an.assessed
    ? { area_level: 'Layer', area_name: an.source === 'wsa_anec' ? 'Western Sydney Airport ANEC (SEPP WPC 2021)' : 'LEP ANEF contours (ePlanning)', name: 'Aircraft noise', on_property: an.value !== null, nearest_distance_m: an.value !== null ? 0 : null,
      search_radius_m: 0, value: an.value !== null ? `ANEF/ANEC ≈ ${an.value}` : 'Outside mapped ANEF/ANEC contours', anef: an.value, assessed: true, source: an.source, licence: 'CC BY 4.0' }
    : notAssessed('Aircraft noise', 'Aircraft noise', 'Sydney Airport ANEF 2045 is published only as a PDF; no open vector contours (check the s10.7 certificate)', null)];
  try { out.easement = [await easementRow(a.lon, a.lat, geojson)]; } catch (e) { out.easement = [notAssessed('Easement', 'Easement', `lot lookup failed (${e.message})`, 'spatial_services_easement')]; }
  return ok(out, { gnaf_pid: a.gnaf_pid, center_lat: a.lat, center_lng: a.lon, search_radius_m: RADIUS,
    sources: [ATTRIBUTION.eplanning, ATTRIBUTION.rfs, ATTRIBUTION.spatial, ATTRIBUTION.epa, ATTRIBUTION.seed, ATTRIBUTION.abs] });
}

async function transport(a) {
  const rows = (await q(`SELECT stop_id, stop_name, modes, location_type, ST_Distance(geom, $1::geography) d, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lon
                         FROM gtfs_stop WHERE ST_DWithin(geom, $1::geography, $2) AND cardinality(modes) > 0 ORDER BY d`, [`SRID=4326;POINT(${a.lon} ${a.lat})`, RADIUS])).rows;
  const nearest = {}; const counts = { bus: 0, train: 0, tram: 0, ferry: 0 }; const w400 = { bus: 0, train: 0, tram: 0, ferry: 0 }; const w800 = { bus: 0, train: 0, tram: 0, ferry: 0 };
  for (const r of rows) for (const m of r.modes) {
    if (!(m in counts)) continue;
    counts[m]++; if (r.d <= 400) w400[m]++; if (r.d <= 800) w800[m]++;
    if (!nearest[m]) nearest[m] = { distance_m: Math.round(r.d), label: r.stop_name, lat: r.lat, lng: r.lon, stop_id: r.stop_id };
  }
  return ok({ center_lat: a.lat, center_lng: a.lon, counts, nearest, within_400_m: w400, within_800_m: w800, gnaf_id: a.gnaf_pid, radius_m: RADIUS }, { source: ATTRIBUTION.tfnsw });
}

async function daList({ hullGeoJSON, lon, lat, radius, months = 24, limit = 2000 }) {
  const where = hullGeoJSON ? `ST_Intersects(geom::geometry, ST_SetSRID(ST_GeomFromGeoJSON($1),4326))` : `ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)`;
  const args = hullGeoJSON ? [hullGeoJSON] : [lon, lat, radius];
  const rows = (await q(`SELECT pan, council, council_ref, status, app_type, lodged, determined, cost, dev_types, description, address, suburb, postcode,
                                ST_Y(geom::geometry) lat, ST_X(geom::geometry) lng ${hullGeoJSON ? '' : ', ST_Distance(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) d'}
                         FROM da WHERE geom IS NOT NULL AND ${where} AND lodged >= (current_date - interval '${Number(months)} months')
                         ORDER BY lodged DESC LIMIT ${Number(limit)}`, args)).rows;
  return rows.map((r) => ({ id: r.pan, pan: r.pan, title: r.description || (r.dev_types || []).join(', ') || r.app_type, description: r.description, type: r.app_type,
    category: (r.dev_types || []).join(', '), stage: r.status, stage_display: r.status, status: r.status, date: r.lodged, lodged: r.lodged, determined: r.determined,
    dollar_value: num(r.cost), cost: num(r.cost), address: r.address, suburb: r.suburb, postcode: r.postcode, council: r.council, council_ref: r.council_ref, lat: r.lat, lng: r.lng,
    ...(r.d !== undefined ? { distance_m: Math.round(Number(r.d)) } : {}) }));
}

// ---- suburb-level ----
const ZONE_COLOURS = [[/^R1/, '#ffa3a3'], [/^R2/, '#ffb6c1'], [/^R3/, '#ff7f7f'], [/^R4/, '#ff4040'], [/^R5/, '#ffd6d6'], [/^RU/, '#e6d7a3'], [/^(B|MU|E1|E2)/, '#62a0ea'], [/^E3/, '#c9a0dc'], [/^E4|^E5|^IN/, '#b388eb'],
  [/^C|^E[2-4]$/, '#9ccc65'], [/^RE1/, '#81c784'], [/^RE2/, '#aed581'], [/^SP/, '#bdbdbd'], [/^W/, '#80d8ff'], [/^(ENZ|ENT|ENP)/, '#a5d6a7']];
const zoneColour = (code) => (ZONE_COLOURS.find(([re]) => re.test(String(code || ''))) || [null, '#b8b8b8'])[1];

async function layerInHull(source, hull, propsFn, bufferM = 800, limit = 4000) {
  const rows = (await q(`SELECT fid, props, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.000005), 6) gj FROM features
                         WHERE source=$1 AND ST_Intersects(geom, ST_Buffer(ST_SetSRID(ST_GeomFromGeoJSON($2),4326)::geography, $3)::geometry) LIMIT $4`, [source, hull, bufferM, limit])).rows;
  return { type: 'FeatureCollection', features: rows.map((r) => ({ type: 'Feature', id: r.fid, properties: propsFn ? propsFn(r.props) : r.props, geometry: JSON.parse(r.gj) })) };
}

async function suburbRoute(sal, rest, params) {
  const hull = await hullOf('sal', sal);
  const S = (b) => ok(b, { suburb: sal });
  if (rest === 'risks/extras') {
    return S(await cached(`extras:${sal}`, 24 * 7, async () => {
      const mbs = (await q(`SELECT mb AS mb_code, count(*)::int n, max(anef_code) anef_code, bool_or(anef_assessed) anef_assessed,
          round(100.0 * count(*) FILTER (WHERE ass_class IS NOT NULL) / count(*), 1) acid_pct,
          round(100.0 * count(*) FILTER (WHERE mine) / count(*), 1) mine_pct,
          round(100.0 * count(*) FILTER (WHERE contam250) / count(*), 1) contam_pct
        FROM address_flags WHERE sal_name = $1 GROUP BY mb`, [sal])).rows;
      const risks = mbs.map((r) => { const o = { mb: r.mb_code, acid_pct: num(r.acid_pct), mine_pct: num(r.mine_pct), contam_pct: num(r.contam_pct) }; if (r.anef_assessed) o.anef_med = r.anef_code ? anefMid(r.anef_code) : null; return o; });
      const epa = await one(`SELECT count(*)::int n FROM features f WHERE f.source='epa_contaminated' AND ST_Intersects(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1),4326))`, [hull]);
      return { area_name: bare(sal), area_level: 'suburb', epa_notices_n: epa?.n ?? null, per_mb: { risks }, sources: [ATTRIBUTION.eplanning, ATTRIBUTION.spatial, ATTRIBUTION.epa, ATTRIBUTION.abs],
        note: 'anef_med is present only where an open ANEF/ANEC map covers the mesh block; Sydney Airport ANEF 2045 has no open vector data. Insurance medians are not open data.' };
    }));
  }
  if (rest === 'risks/property-hazard-counts') {
    return S(await cached(`hazcounts:${sal}`, 24 * 7, async () => {
      const r = await one(`SELECT count(*)::int total, count(*) FILTER (WHERE bushfire)::int bushfire, count(*) FILTER (WHERE flood)::int flood,
          count(*) FILTER (WHERE mine)::int mine, count(*) FILTER (WHERE contam250)::int c250, count(*) FILTER (WHERE contam500)::int c500,
          count(*) FILTER (WHERE ass_class ~* 'class (1|2)')::int ass_high, count(*) FILTER (WHERE anef_code IS NOT NULL)::int anef,
          bool_or(flood_assessed) flood_covered, bool_or(anef_assessed) anef_covered
        FROM address_flags WHERE sal_name = $1`, [sal]);
      if (!r || !r.total) return { area_name: bare(sal), area_level: 'suburb', total_properties: 0, note: 'no flagged addresses (run make ingest-derived)' };
      const nearest = await one(`SELECT min(ST_Distance(f.geom::geography, h.geom::geography)) d FROM area_hull h, features f WHERE h.kind='sal' AND h.code=$1 AND f.source='epa_contaminated' AND ST_DWithin(f.geom::geography, h.geom::geography, 2000)`, [sal]);
      const pct = (n) => (r.total ? round((n / r.total) * 100, 2) : null);
      return { area_name: bare(sal), area_level: 'suburb', total_properties: r.total,
        bushfire: { count: r.bushfire, pct: pct(r.bushfire) }, flood: r.flood_covered ? { count: r.flood, pct: pct(r.flood) } : {},
        mine_subsidence: { count: r.mine, pct: pct(r.mine) },
        contamination: { within_250m_count: r.c250, within_250m_pct: pct(r.c250), within_500m_count: r.c500, within_500m_pct: pct(r.c500), nearest_m: nearest?.d !== null && nearest?.d !== undefined ? Math.round(Number(nearest.d)) : null },
        aircraft_noise: r.anef_covered ? { count: r.anef, pct: pct(r.anef) } : {},
        acid_sulfate: { any_high_count: r.ass_high, any_high_pct: pct(r.ass_high) },
        sources: [ATTRIBUTION.rfs, ATTRIBUTION.eplanning, ATTRIBUTION.spatial, ATTRIBUTION.epa, ATTRIBUTION.gnaf] };
    }));
  }
  if (!hull) return notFound(`no address hull for ${sal} (run make ingest-derived; phase 1 covers the 33 Greater Sydney LGAs)`);
  if (rest === 'shapes/hazards') {
    const layer = params.get('layer');
    const map = { bushfire: 'rfs_bfpl', flood: 'epi_flood', heritage: 'epi_heritage', erosion: 'coastal_erosion', landslide: 'epi_landslide', environment: 'epa_contaminated', acid_sulfate: 'epi_ass', mine_subsidence: 'mine_subsidence' };
    if (!map[layer]) return { status: 422, body: { detail: `layer must be one of ${Object.keys(map).join(', ')}` } };
    return S({ layer, geojson: await layerInHull(map[layer], hull) });
  }
  if (rest === 'shapes/busy-roads') return S({ geojson: await layerInHull('busy_roads', hull, (p) => ({ name: `${p.roadnamebase || ''} ${p.roadnametype || ''}`.trim(), hierarchy: p.functionhierarchy, hierarchy_label: HIER[p.functionhierarchy] })) , source: ATTRIBUTION.spatial });
  if (rest === 'shapes/easements') return S({ geojson: await layerInHull('easements', hull, (p) => ({ easement_type: p.easementtype, width: p.easementwidth })), source: ATTRIBUTION.spatial });
  if (rest === 'shapes/noise-heatmap') return unavailable('no_open_data', 'No open noise heatmap; busy roads (Spatial Services) are served instead.');
  if (rest === 'shapes/public-housing-sa1') {
    const rows = (await q(`SELECT h.code sa1, ST_AsGeoJSON(h.geom, 6) gj, c.total_occ_private t, c.rented_state_housing s FROM area_hull h JOIN census_sa1 c ON c.sa1_code = h.code
                           WHERE h.kind='sa1' AND ST_Intersects(h.geom, ST_Buffer(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)::geography, 1500)::geometry)`, [hull])).rows;
    return S({ geojson: { type: 'FeatureCollection', features: rows.map((r) => ({ type: 'Feature', properties: { sa1: r.sa1, pct: Number(r.t) ? round((Number(r.s) / Number(r.t)) * 100, 1) : null, value: Number(r.t) ? round((Number(r.s) / Number(r.t)) * 100, 1) : null, dwellings: Number(r.t) }, geometry: JSON.parse(r.gj) })) }, source: ATTRIBUTION.abs });
  }
  if (rest === 'shapes/mesh-blocks') {
    const rows = (await q(`SELECT h.code mb, ST_AsGeoJSON(h.geom, 6) gj FROM area_hull h JOIN sydney_mb m ON m.mb_code = h.code WHERE h.kind='mb' AND m.sal_name=$1`, [sal])).rows;
    return S({ geojson: { type: 'FeatureCollection', features: rows.map((r) => ({ type: 'Feature', properties: { mb: r.mb }, geometry: JSON.parse(r.gj) })) }, note: 'mesh-block shapes are concave hulls of G-NAF address points, not ABS boundaries' });
  }
  if (rest === 'development/zoning-map') {
    return S({ geojson: await layerInHull('epi_zoning', hull, (p) => ({ sym_code: p.SYM_CODE, lay_class: p.LAY_CLASS, epi_name: p.EPI_NAME, purpose: p.PURPOSE, color: zoneColour(p.SYM_CODE) })), source: ATTRIBUTION.eplanning });
  }
  if (rest === 'development/building-controls') {
    const hob = await layerInHull('epi_hob', hull, (p) => ({ height_m: num(p.MAX_B_H_M ?? p.MAX_B_H), units: p.UNITS || 'm', sym_code: p.SYM_CODE, lay_class: p.LAY_CLASS, rl: num(p.MAX_B_H_RL), epi_name: p.EPI_NAME }));
    const fsr = await layerInHull('epi_fsr', hull, (p) => ({ fsr: num(p.FSR), value: num(p.FSR), sym_code: p.SYM_CODE, lay_class: p.LAY_CLASS, epi_name: p.EPI_NAME }));
    const lot = await layerInHull('epi_lotsize', hull, (p) => ({ lot_size: num(p.LOT_SIZE), units: p.UNITS, sym_code: p.SYM_CODE, lay_class: p.LAY_CLASS, epi_name: p.EPI_NAME }));
    return S({ hob: { geojson: hob }, fsr: { geojson: fsr }, lot_size: { geojson: lot } }, { source: ATTRIBUTION.eplanning });
  }
  if (rest === 'development/applications') return S({ applications: await daList({ hullGeoJSON: hull, months: Number(params.get('months') || 24) }), as_of: new Date().toISOString().slice(0, 10), source: ATTRIBUTION.da });
  if (rest === 'development/council-rates') return unavailable('not_open_data', 'OLG council time-series data is all-rights-reserved; out of scope for the open-data path.');
  if (rest === 'demographics/tenure' || rest === 'market/investor-concentration' || rest === 'demographics/income') {
    const agg = await one(`SELECT sum(c.total_occ_private) t, sum(c.owned_outright) oo, sum(c.owned_mortgage) om, sum(c.rented_total) r, sum(c.rented_re_agent) ra, sum(c.rented_private_landlord) rp, sum(c.rented_state_housing) rs,
                                  percentile_cont(0.5) WITHIN GROUP (ORDER BY c.median_hhd_income_wk) inc, percentile_cont(0.5) WITHIN GROUP (ORDER BY c.median_rent_wk) rent, percentile_cont(0.5) WITHIN GROUP (ORDER BY c.median_mortgage_month) mort
                           FROM (SELECT DISTINCT sa1_code FROM sydney_mb WHERE sal_name=$1) s JOIN census_sa1 c ON c.sa1_code = s.sa1_code`, [sal]);
    if (!agg || !Number(agg.t)) return unavailable('no_census', `No Census SA1 rows for ${sal}`);
    const t = Number(agg.t);
    const mbs = (await q(`SELECT m.mb_code, m.sa1_code, c.total_occ_private t, c.owned_outright oo, c.owned_mortgage om, c.rented_total r, c.rented_re_agent ra, c.rented_private_landlord rp
                          FROM sydney_mb m JOIN census_sa1 c ON c.sa1_code = m.sa1_code WHERE m.sal_name=$1`, [sal])).rows;
    const p = (n, d) => (Number(d) ? round((Number(n) / Number(d)) * 100, 1) : null);
    if (rest === 'demographics/tenure') {
      return S({ owner_occupied_pct: p(Number(agg.oo) + Number(agg.om), t), renting_pct: p(agg.r, t), owned_outright_pct: p(agg.oo, t), mortgaged_pct: p(agg.om, t), state_housing_pct: p(agg.rs, t),
        census_year: 2021, tier: 'SA1 aggregate (Census 2021 G37), mesh blocks inherit their SA1', dwellings: t,
        microburbs: mbs.map((m) => ({ mb: m.mb_code, street: `SA1 ${m.sa1_code}`, owned_outright_pct: p(m.oo, m.t), mortgaged_pct: p(m.om, m.t), renting_pct: p(m.r, m.t) })), source: ATTRIBUTION.abs });
    }
    if (rest === 'market/investor-concentration') {
      return S({ rental_share_pct: p(Number(agg.ra) + Number(agg.rp), t), renting_pct: p(agg.r, t), basis: 'Census 2021 G37: dwellings rented from a real estate agent or a private landlord (investor proxy) / occupied private dwellings',
        mbs: mbs.map((m) => ({ mb: m.mb_code, pct_investment: p(Number(m.ra) + Number(m.rp), m.t) })), source: ATTRIBUTION.abs });
    }
    return S({ median_hhd_income_wk: round(agg.inc, 0), median_rent_wk_census: round(agg.rent, 0), median_mortgage_month: round(agg.mort, 0), census_year: 2021, basis: 'median of SA1 medians (Census 2021 G02)', source: ATTRIBUTION.abs });
  }
  if (rest === 'market/mortgage-stress') {
    const rows = (await q(`SELECT m.mb_code, m.sa2_code, f.sa2_name, f.mortgage_stress_pct, f.rent_stress_pct, f.mortgage_hh FROM sydney_mb m LEFT JOIN afford_sa2 f ON f.sa2_code = m.sa2_code WHERE m.sal_name=$1`, [sal])).rows;
    const sa2s = [...new Map(rows.filter((r) => r.mortgage_stress_pct !== null).map((r) => [r.sa2_code, r])).values()];
    if (!sa2s.length) return unavailable('no_rdh_sa2', `No RDH affordability row for the SA2s of ${sal}`);
    const main = sa2s.sort((a, b) => rows.filter((r) => r.sa2_code === b.sa2_code).length - rows.filter((r) => r.sa2_code === a.sa2_code).length)[0];
    return S({ score: num(main.mortgage_stress_pct), rent_stress_pct: num(main.rent_stress_pct), sa2: main.sa2_name, sa2_code: main.sa2_code, mortgage_households: num(main.mortgage_hh),
      basis: 'score = % of households with a mortgage paying more than 30% of household income (Census 2021 MAID, via Regional Data Hub). Not the Microburbs 0-100 stress index.',
      mbs: rows.map((r) => ({ mb: r.mb_code, score: num(r.mortgage_stress_pct) })), source: ATTRIBUTION.rdh });
  }
  if (rest === 'market/negative-gearing') {
    const rows = (await q(`SELECT t.postcode, t.income_year, t.individuals, t.net_rent_count, t.net_rent_avg, t.props, n FROM ato_postcode t JOIN
        (SELECT a.postcode, count(*) n FROM address a JOIN sydney_mb m ON m.mb_code=a.mb_2021 WHERE m.sal_name=$1 GROUP BY a.postcode ORDER BY n DESC LIMIT 3) p ON p.postcode = t.postcode ORDER BY n DESC`, [sal])).rows;
    if (!rows.length) return unavailable('no_ato_postcode', `No ATO table 25 row for the postcodes of ${sal}`);
    const r = rows[0];
    return S({ postcode: r.postcode, income_year: r.income_year, individuals: num(r.individuals), landlords: num(r.net_rent_count), landlord_share_pct: num(r.individuals) ? round((num(r.net_rent_count) / num(r.individuals)) * 100, 1) : null,
      avg_net_rent: num(r.net_rent_avg), median_net_rent: r.props?.median_net_rent ?? null, negatively_geared_on_average: num(r.net_rent_avg) !== null ? num(r.net_rent_avg) < 0 : null,
      other_postcodes: rows.slice(1).map((x) => ({ postcode: x.postcode, landlords: num(x.net_rent_count), avg_net_rent: num(x.net_rent_avg) })),
      basis: 'ATO Table 25 by postcode: individuals reporting net rent (landlords) and their average net rent; negative = loss (negatively geared). Suburb-level, not this property.', source: ATTRIBUTION.ato });
  }
  if (rest === 'market/median-rent') {
    const rows = (await q(`SELECT b.postcode, b.dwelling_type, count(*)::int n, percentile_cont(0.5) WITHIN GROUP (ORDER BY b.weekly_rent) med, max(b.lodged) latest FROM bond_lodgement b JOIN
        (SELECT a.postcode, count(*) c FROM address a JOIN sydney_mb m ON m.mb_code=a.mb_2021 WHERE m.sal_name=$1 GROUP BY a.postcode ORDER BY c DESC LIMIT 2) p ON p.postcode=b.postcode
        WHERE b.weekly_rent > 0 GROUP BY ROLLUP (b.postcode, b.dwelling_type) ORDER BY b.postcode NULLS LAST, n DESC`, [sal])).rows;
    if (!rows.length || !Number(rows.find((r) => r.postcode === null)?.n)) return unavailable('no_bond_files_loaded', 'No NSW Fair Trading bond lodgement workbooks loaded (manual download behind a Cloudflare challenge; see backend/README.md).');
    const all = rows.find((r) => r.postcode === null);
    return S({ median_rent_wk: round(all?.med, 0), n_bonds: all?.n, as_of: all?.latest, by_postcode_type: rows.filter((r) => r.postcode && r.dwelling_type).map((r) => ({ postcode: r.postcode, dwelling_type: r.dwelling_type, n: r.n, median_rent_wk: round(r.med, 0) })),
      basis: 'median weekly rent of new bonds lodged (last files loaded), by the suburb\'s main postcodes', source: ATTRIBUTION.bonds });
  }
  if (rest === 'market/affordability') return unavailable('needs_sales_data', 'Price-to-income needs sale prices; NSW Valuer General PSI is CC BY-NC-ND. Median household income is served at demographics/income.');
  if (rest === 'market/yield-pct' || rest === 'market/vacancy-rate' || rest === 'market/vacancy-map' || rest === 'market/median-price-map') return unavailable('out_of_scope_open_data', 'Needs sale prices or listing feeds (Valuer General PSI is CC BY-NC-ND; listings are not open data).');
  return null;
}

// ---------- dispatcher ----------
export async function handle(pathname, params) {
  let m;
  if (pathname === '/v1/geocode/address') return geocode(params);
  if (pathname === '/v1/geocode/suburb') {
    const sal = await salOf(params.get('name') || params.get('suburb') || params.get('q') || '');
    return sal ? ok([{ name: sal, sal, state: 'NSW' }]) : ok([]);
  }
  if ((m = pathname.match(/^\/v1\/properties\/([A-Za-z0-9]+)\/(.+)$/))) {
    const [, gnaf, rest] = m;
    const a = await addr(gnaf);
    if (!a) return notFound(`no G-NAF address ${gnaf} in the open-data database (NSW only)`);
    if (rest === 'profile') return profile(a);
    if (rest === 'risks/all') return risksAll(a, params);
    if (rest === 'transport/nearby') return transport(a);
    if (rest === 'surroundings/public-housing') return unavailable('no_open_data', 'No open address-level public-housing source; the SA1 share is in risks/all.public_housing (Census 2021).');
    if (rest === 'valuation/negative-gearing') return unavailable('no_property_level_open_data', 'Needs a price and rent estimate; see /v1/suburbs/{SAL}/market/negative-gearing (ATO postcode data).');
    if (rest === 'development/applications') return ok({ applications: await daList({ lon: a.lon, lat: a.lat, radius: Number(params.get('radius_m') || 500), months: Number(params.get('months') || 24) }), radius_m: Number(params.get('radius_m') || 500), source: ATTRIBUTION.da });
    if (rest === 'street/profile' || rest === 'valuation/agent-quoting' || rest === 'valuation/avm') return null; // Microburbs-only rows
    return null;
  }
  if ((m = pathname.match(/^\/v1\/suburbs\/([^/]+)\/(.+)$/))) {
    const sal = await salOf(decodeURIComponent(m[1]));
    if (!sal) return notFound(`unknown suburb ${decodeURIComponent(m[1])}`);
    return suburbRoute(sal, m[2], params);
  }
  return null;
}

export async function health() {
  const r = await one(`SELECT (SELECT count(*) FROM address) addresses, (SELECT count(*) FROM features) features, (SELECT count(*) FROM da) das, (SELECT count(*) FROM gtfs_stop) stops,
                              (SELECT count(*) FROM census_sa1) sa1s, (SELECT count(*) FROM ingest_state WHERE done) steps_done`);
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]));
}
