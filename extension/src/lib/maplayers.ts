// Builds the map drawer payload for one panel row. Chrome-free (runs in the service worker and in Node).
// Every call goes through the local proxy; responses stay in the caller's in-memory per-tab cache.
import { mbGet, type MbResult } from './mb';
import { HAZARD_KEYS } from './mapids';
import { haversine } from './geo';
import type { Bundle } from './rules';
import type { LegendItem, MapLayer, MapPayload } from './types';

export interface MapCtx {
  gnaf: string;
  sal: string;
  address: string;
  bundle: Bundle;
  /** per-tab promise cache, keyed by path; cleared when the tab analyses a new address */
  cache: Map<string, Promise<MbResult>>;
}

const HAZ: Record<string, { label: string; color: string }> = {
  flood: { label: 'Flood (modelled)', color: '#5fb4ff' },
  historical_flood: { label: 'Flood (historical)', color: '#3d8bd9' },
  bushfire: { label: 'Bushfire-prone land', color: '#ff8a3d' },
  heritage: { label: 'Heritage', color: '#d9c08c' },
  landslide: { label: 'Landslide', color: '#c9a27a' },
  erosion: { label: 'Erosion', color: '#c9a27a' },
  environment: { label: 'Contamination', color: '#b48cff' },
  hv_power_line: { label: 'HV power line', color: '#f4e27a' }
};
const PH_RAMP: Array<[number, string]> = [[0, '#22303a'], [5, '#3d6b86'], [15, '#7fb3c8'], [30, '#e5b45a'], [50, '#f4e27a']];

const fc = (features: any[] = []) => ({ type: 'FeatureCollection', features });
const featuresOf = (g: any): any[] => (g && Array.isArray(g.features) ? g.features.filter((f: any) => f && f.geometry) : []);

function cached(ctx: MapCtx, path: string, params?: Record<string, string>): Promise<MbResult> {
  const key = path + (params ? '?' + new URLSearchParams(params) : '');
  let p = ctx.cache.get(key);
  if (!p) { p = mbGet(path, params); ctx.cache.set(key, p); p.then((r) => { if (!r.ok && r.kind !== 'NO_DATA') ctx.cache.delete(key); }); }
  return p;
}

export function centerOf(b: Bundle): [number, number] | null {
  const t = b.transport?.ok ? b.transport.data : null;
  if (t && typeof t.center_lat === 'number' && typeof t.center_lng === 'number') return [t.center_lng, t.center_lat];
  const ph = b.ph200?.ok ? b.ph200.data : null;
  const self = (ph?.flagged || []).find((f: any) => f?.gnaf_pid === b.gnaf && typeof f.lat === 'number');
  if (self) return [self.lng, self.lat];
  for (const k of ['center_lat', 'lat', 'latitude']) {
    const p = b.profile?.ok ? b.profile.data : null;
    if (p && typeof p[k] === 'number') return [p.center_lng ?? p.lng ?? p.longitude, p[k]];
  }
  return null;
}

/** Walk every coordinate pair of a geometry. */
function eachCoord(geom: any, fn: (x: number, y: number) => void) {
  const walk = (c: any) => { if (typeof c?.[0] === 'number') fn(c[0], c[1]); else if (Array.isArray(c)) c.forEach(walk); };
  if (geom?.type === 'GeometryCollection') geom.geometries.forEach((g: any) => eachCoord(g, fn)); else walk(geom?.coordinates);
}

/** Keep suburb-wide features that come within `m` of the property (suburb layers can be large). */
function nearby(features: any[], c: [number, number] | null, m = 1000): any[] {
  if (!c) return features;
  return features.filter((f) => { let hit = false; eachCoord(f.geometry, (x, y) => { if (!hit && haversine(c[1], c[0], y, x) <= m) hit = true; }); return hit; });
}

function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Point-in-polygon for Polygon / MultiPolygon features. */
export function containing(features: any[], c: [number, number] | null): any | undefined {
  if (!c) return undefined;
  return features.find((f) => {
    const g = f.geometry; const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.some((p: number[][][]) => inRing(c[0], c[1], p[0]) && !p.slice(1).some((h) => inRing(c[0], c[1], h)));
  });
}

async function hazardLayer(ctx: MapCtx, key: string): Promise<{ layer?: MapLayer; source: string; err?: string; note?: string }> {
  const spec = HAZ[key];
  const r = await cached(ctx, `/v1/properties/${encodeURIComponent(ctx.gnaf)}/risks/all`, { geojson: 'true' });
  const v = r.ok ? r.data?.[key] : undefined;
  const rows: any[] = Array.isArray(v) ? v : v ? [v] : [];
  if (r.ok) {
    const feats = rows.flatMap((row) => featuresOf(row?.geojson));
    if (feats.length || rows.length === 0) {
      return { layer: { id: key, kind: 'hazard', label: spec.label, color: spec.color, data: fc(feats) }, source: 'risks/all?geojson=true (1 km clip)' };
    }
  }
  const row = rows[0] || {};
  if (!SUBURB_HAZARD_LAYERS.has(key)) {
    // risks/all lists this layer but returns no geometry for it, and the suburb endpoint has no such layer.
    const note = row.features_within_radius ? `${row.features_within_radius} features within 1 km, nearest ${Math.round(row.nearest_distance_m)} m; Microburbs returns no geometry for this layer` : undefined;
    return { layer: { id: key, kind: 'hazard', label: spec.label, color: spec.color, data: fc([]) }, source: 'risks/all?geojson=true', note };
  }
  // Fallback: the suburb hazard layer, trimmed to 1 km.
  const s = await cached(ctx, `/v1/suburbs/${encodeURIComponent(ctx.sal)}/shapes/hazards`, { layer: key, geojson: 'true' });
  if (s.ok) {
    const feats = nearby(featuresOf(s.data?.geojson), centerOf(ctx.bundle));
    return { layer: { id: key, kind: 'hazard', label: spec.label, color: spec.color, data: fc(feats) }, source: 'shapes/hazards (suburb, trimmed to 1 km)' };
  }
  return { source: 'risks/all', err: errText(!r.ok ? r : !s.ok ? s : undefined) };
}

// Layers GET /v1/suburbs/{SAL}/shapes/hazards accepts (anything else is a 422).
const SUBURB_HAZARD_LAYERS = new Set(['bushfire', 'flood', 'heritage', 'erosion', 'landslide']);
const errText = (r?: MbResult) => (!r || r.ok ? undefined : typeof r.message === 'string' ? r.message : r.kind);

const isEmpty = (layers: MapLayer[]) => layers.every((l) => !featuresOf(l.data).length);

export async function buildMapPayload(rowId: string, ctx: MapCtx): Promise<MapPayload> {
  const center = centerOf(ctx.bundle);
  const S = `/v1/suburbs/${encodeURIComponent(ctx.sal)}`;
  const base = { type: 'MBRF_MAP' as const, rowId, center, address: ctx.address };

  if ((HAZARD_KEYS as readonly string[]).includes(rowId)) {
    const spec = HAZ[rowId];
    const h = await hazardLayer(ctx, rowId);
    const layers = h.layer ? [h.layer] : [];
    const legend: LegendItem[] = [{ label: spec.label, color: spec.color, style: rowId === 'hv_power_line' ? 'line' : 'hatch' }];
    return { ...base, title: spec.label, sub: `MICROBURBS · ${h.source.toUpperCase()}`, layers, legend,
      empty: h.note ? `No ${spec.label} geometry from Microburbs` : !layers.length || isEmpty(layers) ? `No mapped ${spec.label.replace(/^HV/, 'HV').toLowerCase().replace('hv ', 'HV ')} within 1 km` : undefined,
      card: h.note ? { title: 'Note', lines: [h.note] } : undefined, error: h.err };
  }

  if (rowId === 'ph_area' || rowId === 'ph_200') {
    const r = await cached(ctx, `${S}/shapes/public-housing-sa1`, { geojson: 'true' });
    const layers: MapLayer[] = [];
    if (r.ok) layers.push({ id: 'ph_sa1', kind: 'choropleth', label: 'Public housing share (SA1)', data: fc(nearby(featuresOf(r.data?.geojson), center, 1500)) });
    const flagged: any[] = ctx.bundle.ph200?.ok ? ctx.bundle.ph200.data?.flagged || [] : [];
    const pts = flagged.filter((f) => typeof f?.lat === 'number' && f.gnaf_pid !== ctx.gnaf)
      .map((f) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [f.lng, f.lat] } }));
    layers.push({ id: 'ph_pts', kind: 'points', label: 'Flagged homes within 200 m', color: '#f4e9d8', data: fc(pts) });
    const legend: LegendItem[] = [
      ...PH_RAMP.map(([v, c], i) => ({ label: `${v}${i === PH_RAMP.length - 1 ? '%+' : `–${PH_RAMP[i + 1][0]}%`}`, color: c, style: 'fill' as const })),
      { label: `Flagged home ≤200 m (${pts.length})`, color: '#f4e9d8', style: 'dot' }
    ];
    return { ...base, title: 'Public housing', sub: 'MICROBURBS · SHAPES/PUBLIC-HOUSING-SA1 + SURROUNDINGS', layers, legend,
      empty: isEmpty(layers) ? 'No mapped public housing within 1 km' : undefined, error: !r.ok && r.kind !== 'NO_DATA' ? errText(r) : undefined };
  }

  if (rowId === 'planning' || rowId === 'max_height') {
    const [z, bc] = await Promise.all([cached(ctx, `${S}/development/zoning-map`), cached(ctx, `${S}/development/building-controls`)]);
    const layers: MapLayer[] = [];
    const legend: LegendItem[] = [];
    const lines: string[] = [];
    if (z.ok) {
      const feats = nearby(featuresOf(z.data?.geojson), center, 1200);
      layers.push({ id: 'zoning', kind: 'zoning', label: 'Zoning', data: fc(feats) });
      const seen = new Set<string>();
      for (const f of feats) { const p = f.properties || {}; const k = `${p.sym_code} ${p.lay_class}`; if (!seen.has(k) && seen.size < 5) { seen.add(k); legend.push({ label: `${p.sym_code || ''} ${p.lay_class || ''}`.trim(), color: p.color || '#b8b8b8', style: 'fill' }); } }
      const at = containing(feats, center);
      if (at) lines.push(`ZONE  ${at.properties?.sym_code || '?'} · ${at.properties?.lay_class || ''}`);
    }
    if (bc.ok) {
      const feats = nearby(featuresOf(bc.data?.hob?.geojson), center, 900);
      layers.push({ id: 'hob', kind: 'hob', label: 'Height of building limit', color: '#4fd8e8', data: fc(feats) });
      legend.push({ label: 'Height limit (HOB), extruded', color: '#4fd8e8', style: 'box' });
      const at = containing(feats, center);
      if (at) lines.push(`HEIGHT LIMIT  ${at.properties?.height_m ?? '?'} ${at.properties?.units || 'm'}`);
      const fsr = containing(featuresOf(bc.data?.fsr?.geojson), center);
      if (fsr) lines.push(`FSR  ${fsr.properties?.fsr ?? fsr.properties?.value ?? '?'}:1`);
    }
    return { ...base, title: 'Planning: zone + height limit', sub: 'MICROBURBS · DEVELOPMENT/ZONING-MAP + BUILDING-CONTROLS', layers, legend,
      card: lines.length ? { title: 'At this address', lines: [...lines, 'Verify on the s10.7 certificate'] } : undefined,
      empty: isEmpty(layers) ? 'No mapped zoning within 1 km' : undefined, error: !z.ok && !bc.ok ? errText(z) || errText(bc) : undefined };
  }

  if (rowId === 'anef' || rowId === 'roads') {
    const [n, br] = await Promise.all([cached(ctx, `${S}/shapes/noise-heatmap`, { geojson: 'true' }), cached(ctx, `${S}/shapes/busy-roads`, { geojson: 'true' })]);
    const layers: MapLayer[] = [];
    if (n.ok) layers.push({ id: 'noise', kind: 'heat', label: 'Noise (relative 0–1)', data: fc(nearby(featuresOf(n.data?.geojson), center, 1500)) });
    if (br.ok) layers.push({ id: 'roads', kind: 'lines', label: 'Busy roads', color: '#f0e7d9', data: fc(nearby(featuresOf(br.data?.geojson), center, 1000)) });
    return { ...base, title: rowId === 'anef' ? 'Noise around the address' : 'Busy roads + noise', sub: 'MICROBURBS · SHAPES/NOISE-HEATMAP + BUSY-ROADS',
      layers, legend: [{ label: 'Noise, low → high', color: '#990000', style: 'fill' }, { label: 'Busy road', color: '#f0e7d9', style: 'line' }],
      card: rowId === 'anef' ? { title: 'Note', lines: ['Composite noise index, not an ANEF contour', 'Check the Sydney Airport ANEF map'] } : undefined,
      empty: isEmpty(layers) ? 'No mapped busy roads or noise within 1 km' : undefined };
  }

  if (rowId === 'easements') {
    const r = await cached(ctx, `${S}/shapes/easements`, { geojson: 'true' });
    const layers: MapLayer[] = r.ok ? [{ id: 'easements', kind: 'hazard', label: 'Easements', color: '#e5b45a', data: fc(nearby(featuresOf(r.data?.geojson), center)) }] : [];
    return { ...base, title: 'Easements', sub: 'MICROBURBS · SHAPES/EASEMENTS', layers, legend: [{ label: 'Easement', color: '#e5b45a', style: 'hatch' }],
      empty: isEmpty(layers) ? 'No mapped easements within 1 km' : undefined, error: !r.ok && r.kind !== 'NO_DATA' ? errText(r) : undefined };
  }

  if (rowId === 'tenure' || rowId === 'median_price') {
    const [mbs, src] = await Promise.all([
      cached(ctx, `${S}/shapes/mesh-blocks`, { geojson: 'true' }),
      rowId === 'tenure' ? cached(ctx, `${S}/demographics/tenure`) : cached(ctx, `${S}/market/median-price-map`, { property_type: ctx.bundle.ptype || 'house' })
    ]);
    const vals = new Map<string, number>();
    if (src.ok) for (const m of src.data?.microburbs || []) { const v = rowId === 'tenure' ? m?.renting_pct : m?.median_price; if (typeof v === 'number') vals.set(String(m.mb), v); }
    const feats = mbs.ok ? nearby(featuresOf(mbs.data?.geojson), center, 1200).filter((f) => vals.has(String(f.properties?.mb)))
      .map((f) => ({ ...f, properties: { ...f.properties, v: vals.get(String(f.properties?.mb)) } })) : [];
    const ramp: Array<[number, string]> = rowId === 'tenure'
      ? [[0, '#22303a'], [25, '#3d6b86'], [50, '#7fb3c8'], [70, '#e5b45a'], [90, '#f4e27a']]
      : [[600000, '#22303a'], [1000000, '#3d6b86'], [1500000, '#7fb3c8'], [2500000, '#e5b45a'], [4000000, '#f4e27a']];
    const label = rowId === 'tenure' ? 'Renters % (mesh block)' : `Median ${ctx.bundle.ptype || 'house'} price (mesh block)`;
    const fmtv = (v: number) => (rowId === 'tenure' ? `${v}%` : `$${(v / 1e6).toFixed(v < 1e6 ? 2 : 1)}m`);
    const layers: MapLayer[] = [{ id: rowId === 'tenure' ? 'renters_mb' : 'price_mb', kind: 'choropleth', label, prop: 'v', ramp, data: fc(feats) }];
    return { ...base, title: rowId === 'tenure' ? 'Renters by mesh block' : `Median ${ctx.bundle.ptype || 'house'} price`,
      sub: `MICROBURBS · ${rowId === 'tenure' ? 'DEMOGRAPHICS/TENURE' : 'MARKET/MEDIAN-PRICE-MAP'} + SHAPES/MESH-BLOCKS`, layers,
      legend: ramp.map(([v, c], i) => ({ label: i === ramp.length - 1 ? `${fmtv(v)}+` : `${fmtv(v)}–${fmtv(ramp[i + 1][0])}`, color: c, style: 'fill' as const })),
      empty: feats.length ? undefined : `No mapped ${rowId === 'tenure' ? 'tenure' : 'prices'} within 1 km`, error: !mbs.ok ? errText(mbs) : !src.ok && src.kind !== 'NO_DATA' ? errText(src) : undefined };
  }

  if (rowId === 'das') {
    const r = await cached(ctx, `${S}/development/applications`);
    const list: any[] = r.ok ? (Array.isArray(r.data) ? r.data : r.data?.applications || r.data?.items || r.data?.das || []) : [];
    const pts = list.filter((a) => typeof (a.lat ?? a.latitude) === 'number').map((a) => ({ type: 'Feature', properties: { dollar_value: a.dollar_value ?? a.cost ?? 0 },
      geometry: { type: 'Point', coordinates: [a.lng ?? a.lon ?? a.longitude, a.lat ?? a.latitude] } }));
    const near = nearby(pts, center, 1000);
    return { ...base, title: 'Development applications', sub: 'MICROBURBS · DEVELOPMENT/APPLICATIONS', layers: [{ id: 'das', kind: 'points', label: 'DAs', color: '#f4e9d8', data: fc(near) }],
      legend: [{ label: 'Development application', color: '#f4e9d8', style: 'dot' }], empty: near.length ? undefined : 'No mapped development applications within 1 km' };
  }

  if (rowId === 'street') {
    const d = ctx.bundle.street?.ok ? ctx.bundle.street.data || {} : {};
    const rank = d.forecast_rank || {}; const p = d.profile || {};
    const lines = [
      `RANK  ${rank.rank ?? '?'} / ${rank.total ?? d.streets_in_suburb ?? '?'}  ${rank.tercile ? `(${rank.tercile})` : ''}`.trim(),
      `4-YR  ${p.annual_4y ?? '?'} %/yr  vs suburb ${d.suburb_medians?.annual_4y ?? '?'} %/yr`,
      `SALES  ${p.n_sales ?? '?'}  ·  CONFIDENCE ${p.confidence || '?'}`
    ];
    return { ...base, title: p.title || d.street || 'Street forecast', sub: 'MICROBURBS · STREET/PROFILE (NO STREET GEOMETRY)', layers: [], legend: [],
      card: { title: p.title || d.street || 'Street', lines: [...lines, 'Forecast, not a guarantee'] } };
  }

  return { ...base, title: rowId, sub: '', layers: [], legend: [], empty: 'No map for this row' };
}
