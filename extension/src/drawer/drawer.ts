// Map drawer ("urban scanner"): an extension page iframed beside the panel. It receives a MapPayload by postMessage
// from the content script (GeoJSON only) and draws it in the reel renderer's "layers" look at interactive scale.
// No chrome.* APIs here, so the same file runs in a plain browser for the headless test.
// MapLibre's CSP build: the worker is a file in the package, not a blob: URL (MV3 extension pages forbid blob workers).
// @ts-ignore - the CSP bundle has no separate typings; it is the same API as 'maplibre-gl'.
import mlCsp from 'maplibre-gl/dist/maplibre-gl-csp.js';
import type * as ML from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapLayer, MapPayload } from '../lib/types';

const maplibregl = mlCsp as typeof ML;
maplibregl.setWorkerUrl(new URL('maplibre-worker.js', location.href).href);

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, cls?: string, txt?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

// House style: the reel's OpenFreeMap vector map, desaturated to the H&M near-black ground. No labels (no glyph fetch).
const ST = { land: '#1b1b1b', resi: '#202020', park: '#1d221e', wood: '#1c201c', water: '#0d1317', road: '#a9a7a1', bld: '#262626', bldTop: '#4a4946' };
function houseStyle(): ML.StyleSpecification {
  return {
    version: 8,
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': ST.land } },
      { id: 'resi', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]], paint: { 'fill-color': ST.resi } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': ST.park } },
      { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]], paint: { 'fill-color': ST.wood, 'fill-opacity': .7 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': ST.water } },
      { id: 'rd_minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'secondary']]], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ST.road, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, .06, 14, .18, 17, .26],
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, .4, 14, 1.4, 17, 7, 19, 18] } },
      { id: 'rd_major', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6,
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk', 'motorway']]], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ST.road, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, .12, 10, .28, 16, .34],
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, .4, 10, 1.2, 14, 2.6, 17, 12, 19, 28] } },
      { id: 'bld', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13,
        paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, ST.bld, 60, ST.bldTop],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': .88, 'fill-extrusion-vertical-gradient': true } }
    ]
  } as ML.StyleSpecification;
}

const PH_RAMP = ['interpolate', ['linear'], ['to-number', ['coalesce', ['get', 'public_housing_pct'], 0]], 0, '#22303a', 5, '#3d6b86', 15, '#7fb3c8', 30, '#e5b45a', 50, '#f4e27a'];

function rampOf(L: MapLayer): any {
  if (!L.ramp || !L.prop) return PH_RAMP;
  const e: any[] = ['interpolate', ['linear'], ['to-number', ['coalesce', ['get', L.prop], L.ramp[0][0]]]];
  L.ramp.forEach(([v, c]) => e.push(v, c));
  return e;
}

function hatchImage(color: string) {
  const n = 32, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d')!;
  g.strokeStyle = color; g.lineWidth = 3; g.globalAlpha = .85;
  for (let o = -n; o <= n * 2; o += 10) { g.beginPath(); g.moveTo(o, 0); g.lineTo(o - n, n); g.stroke(); }
  return g.getImageData(0, 0, n, n);
}

/** Map layers per kind, after the reel's `layers` mode. Fills go under OSM buildings; extrusions, lines and points over. */
function addLayer(map: ML.Map, L: MapLayer) {
  const src = `src_${L.id}`;
  map.addSource(src, { type: 'geojson', data: L.data });
  const c = L.color || '#b8b8b8';
  const isLine = ['==', ['geometry-type'], 'LineString'];
  const isPoly = ['==', ['geometry-type'], 'Polygon'];
  const under = 'bld';
  const add = (spec: any, below = false) => map.addLayer({ ...spec, source: src }, below ? under : undefined);
  if (L.kind === 'hazard') {
    if (!map.hasImage(`hatch_${L.id}`)) map.addImage(`hatch_${L.id}`, hatchImage(c));
    add({ id: L.id, type: 'fill', filter: isPoly, paint: { 'fill-color': c, 'fill-opacity': .3 } }, true);
    add({ id: `${L.id}_hatch`, type: 'fill', filter: isPoly, paint: { 'fill-pattern': `hatch_${L.id}`, 'fill-opacity': .55 } }, true);
    add({ id: `${L.id}_ln`, type: 'line', filter: isPoly, paint: { 'line-color': c, 'line-width': 2, 'line-dasharray': [3, 2] } });
    add({ id: `${L.id}_glow`, type: 'line', filter: isLine, paint: { 'line-color': '#000', 'line-width': 12, 'line-blur': 6, 'line-opacity': .7 } });
    add({ id: `${L.id}_line`, type: 'line', filter: isLine, layout: { 'line-cap': 'round' }, paint: { 'line-color': c, 'line-width': 3, 'line-dasharray': [2, 1.5] } });
  } else if (L.kind === 'choropleth') {
    add({ id: L.id, type: 'fill', paint: { 'fill-color': rampOf(L), 'fill-opacity': .6 } }, true);
    add({ id: `${L.id}_ln`, type: 'line', paint: { 'line-color': '#0d0d0d', 'line-width': 1.2 } }, true);
  } else if (L.kind === 'zoning') {
    const fc = ['coalesce', ['get', 'color'], '#b8b8b8'];
    add({ id: L.id, type: 'fill', paint: { 'fill-color': fc, 'fill-opacity': .42 } }, true);
    add({ id: `${L.id}_ln`, type: 'line', paint: { 'line-color': fc, 'line-width': 1.4, 'line-opacity': .9 } }, true);
  } else if (L.kind === 'hob') {
    const hx = ['to-number', ['coalesce', ['get', 'height_m'], 0]];
    add({ id: L.id, type: 'fill-extrusion', paint: { 'fill-extrusion-color': ['interpolate', ['linear'], hx, 0, '#1f6f7a', 40, c],
      'fill-extrusion-height': hx, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .3, 'fill-extrusion-vertical-gradient': true } });
    add({ id: `${L.id}_lid`, type: 'fill-extrusion', paint: { 'fill-extrusion-color': '#9eeefa', 'fill-extrusion-height': hx,
      'fill-extrusion-base': ['max', 0, ['-', hx, 0.8]], 'fill-extrusion-opacity': .55 } });
    add({ id: `${L.id}_ln`, type: 'line', paint: { 'line-color': c, 'line-width': 1.4, 'line-opacity': .8 } });
  } else if (L.kind === 'heat') {
    add({ id: L.id, type: 'fill', paint: { 'fill-color': ['coalesce', ['get', 'color'], '#990000'], 'fill-opacity': ['*', .75, ['to-number', ['coalesce', ['get', 'fill_opacity'], .5]]] } }, true);
  } else if (L.kind === 'lines') {
    add({ id: `${L.id}_glow`, type: 'line', layout: { 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-width': 9, 'line-blur': 6, 'line-opacity': .8 } });
    add({ id: L.id, type: 'line', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': c,
      'line-width': ['match', ['get', 'road_class'], ['motorway', 'trunk'], 4, 'primary', 3, 2], 'line-opacity': .85 } });
  } else if (L.kind === 'points') {
    add({ id: L.id, type: 'circle', paint: { 'circle-color': c, 'circle-radius': 4.5, 'circle-stroke-color': '#120d0a', 'circle-stroke-width': 2,
      'circle-pitch-alignment': 'map' } });
  }
}

/** The subject property: the hand's red circle, drawn on. */
function subjectMarker(label: string) {
  const wrap = el('div', 'subject');
  wrap.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M36 6 C 18 4, 5 16, 6 32 C 7 50, 22 60, 36 58 C 52 56, 60 42, 58 28 C 56 14, 44 6, 30 7 C 24 8, 19 10, 15 14"/><circle class="pin" cx="32" cy="32" r="3"/></svg>`;
  wrap.append(el('div', 'tag', label));
  return wrap;
}

function bboxOf(layers: MapLayer[], center: [number, number] | null): [[number, number], [number, number]] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const push = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  const walk = (c: any) => { if (typeof c?.[0] === 'number') push(c[0], c[1]); else if (Array.isArray(c)) c.forEach(walk); };
  for (const L of layers) for (const f of L.data?.features || []) walk(f.geometry?.coordinates);
  if (center) {
    // keep the property in frame, at least ±250 m around it, and at most ±1.1 km
    const kx = 1 / (111320 * Math.cos(center[1] * Math.PI / 180)), ky = 1 / 110540;
    push(center[0] - 250 * kx, center[1] - 250 * ky); push(center[0] + 250 * kx, center[1] + 250 * ky);
    x0 = Math.max(x0, center[0] - 1100 * kx); x1 = Math.min(x1, center[0] + 1100 * kx);
    y0 = Math.max(y0, center[1] - 1100 * ky); y1 = Math.min(y1, center[1] + 1100 * ky);
  }
  return isFinite(x0) ? [[x0, y0], [x1, y1]] : null;
}

const BASE_IDS = ['bg', 'resi', 'park', 'wood', 'water', 'rd_minor', 'rd_major', 'bld'];
const uniqLayers = (ps: MapPayload[]) => { const seen = new Set<string>(); return ps.flatMap((p) => p.layers).filter((L) => !seen.has(L.id) && !!seen.add(L.id) && L.data?.features?.length); };

function renderCards(ps: MapPayload[]) {
  const lg = $('legend');
  if (!ps.length) { lg.hidden = true; $('info').hidden = true; $('empty').hidden = true; return; }
  if (ps.length === 1) {
    const p = ps[0];
    lg.replaceChildren(el('h1', '', p.title), el('div', 'sub', p.sub));
  } else {
    lg.replaceChildren(el('h1', '', mode === 'stack' ? `${uniqLayers(ps).length} slabs, stacked` : `${uniqLayers(ps).length} layers, flat`), el('div', 'sub', 'MICROBURBS · UNTICK TO REMOVE'));
  }
  for (const p of ps) {
    if (ps.length > 1) {
      const g = el('label', 'grp');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
      cb.onchange = () => window.parent.postMessage({ type: 'MBRF_TOGGLE', rowId: p.rowId }, '*');
      // compact in multi mode: one swatch per row so the legend doesn't cover the stack
      const sw = el('span', 'sw fill'); sw.style.background = p.legend[0]?.color || '#555';
      g.append(cb, sw, el('span', '', p.title + (p.empty ? ' · none within 1 km' : '')));
      lg.append(g);
      continue;
    }
    for (const it of p.legend) {
      const row = el('div', 'it');
      const sw = el('span', `sw ${it.style || 'fill'}`);
      if (it.style === 'hatch') { sw.style.backgroundColor = it.color + '55'; sw.style.color = it.color; } else sw.style.background = it.color;
      row.append(sw, el('span', '', it.label));
      lg.append(row);
    }
  }
  lg.hidden = false;
  const info = $('info');
  const cards = ps.filter((p) => p.card);
  if (cards.length) {
    info.replaceChildren(...cards.slice(0, 2).flatMap((p) => [el('h2', '', p.card!.title), ...p.card!.lines.map((l) => el('div', '', l))]));
    info.hidden = false;
  } else info.hidden = true;
  const em = $('empty');
  const bad = ps.filter((p) => p.error || p.empty);
  if (bad.length === ps.length) {
    const p = bad[0];
    em.replaceChildren(el('h2', '', p.error ? 'Could not load this layer' : ps.length > 1 ? 'Nothing mapped within 1 km' : p.empty!), el('div', '', p.error || 'Microburbs · 1 km around the address'));
    em.hidden = false;
  } else em.hidden = true;
}

let map: ML.Map | undefined;
let marker: ML.Marker | undefined;
let orbit = 0;
let userMoved = false;
let mode: 'stack' | 'flat' = 'flat';
let drawn: 'stack' | 'flat' | null = null;
let currentSet: MapPayload[] = [];

function startOrbit() {
  cancelAnimationFrame(orbit);
  if (reduced || userMoved || !map) return;
  let last = performance.now();
  const step = (t: number) => {
    if (!map || userMoved) return;
    const dt = Math.min(100, t - last); last = t;
    if (!map.isMoving()) map.setBearing(map.getBearing() + dt * 0.004); // ~4°/s
    orbit = requestAnimationFrame(step);
  };
  orbit = requestAnimationFrame(step);
}

function clearData() {
  if (!map) return;
  for (const l of map.getStyle().layers || []) if (!BASE_IDS.includes(l.id)) map.removeLayer(l.id);
  for (const s of Object.keys(map.getStyle().sources || {})) if (s !== 'omt') map.removeSource(s);
  slabs.forEach((s) => s.tab.remove()); slabs.clear();
  drawn = null;
}

function setMarker(c: [number, number] | null) {
  marker?.remove(); marker = undefined;
  if (c && map) marker = new maplibregl.Marker({ element: subjectMarker('Subject'), anchor: 'center' }).setLngLat(c).addTo(map);
}

function drawFlat(ps: MapPayload[]) {
  if (!map) return;
  clearData(); drawn = 'flat';
  uniqLayers(ps).forEach((L) => addLayer(map!, L));
  const center = ps.find((p) => p.center)?.center || null;
  setMarker(center);
  const bb = bboxOf(uniqLayers(ps), center);
  const opts = { padding: { top: 120, bottom: 50, left: 40, right: 40 }, pitch: 55, bearing: map.getBearing(), maxZoom: 17, duration: reduced ? 0 : 1600 };
  if (bb) map.fitBounds(bb, opts); else if (center) map.easeTo({ center, zoom: 16, pitch: 55, duration: opts.duration });
  map.once('moveend', startOrbit);
}

// ---------- stack mode: each layer a translucent slab floating at its own altitude (reel renderer's stack mode) ----------
const THICK = 6, RISE = 1200, STAGGER = 600;
const HAZ_ORDER = ['flood', 'historical_flood', 'heritage', 'environment', 'bushfire', 'landslide', 'erosion', 'hv_power_line', 'easements'];
function rankOf(L: MapLayer) {
  if (L.kind === 'zoning') return 0;
  if (L.kind === 'choropleth') return 10 + (L.id.includes('rent') ? 5 : 0);
  if (L.kind === 'hazard') return 20 + Math.max(0, HAZ_ORDER.indexOf(L.id));
  if (L.kind === 'hob') return 40;
  if (L.kind === 'heat') return 50;
  if (L.kind === 'lines') return 51;
  return 60; // points
}
const OP: Record<string, number> = { zoning: .55, choropleth: .6, hazard: .45, hob: .38, heat: .5, lines: .9, points: .95 };
function circlePoly(ll: number[], rM: number, n = 14) {
  const ring: number[][] = [], kx = 1 / (111320 * Math.cos(ll[1] * Math.PI / 180)), ky = 1 / 110540;
  for (let i = 0; i <= n; i++) { const a = 2 * Math.PI * (i % n) / n; ring.push([ll[0] + Math.cos(a) * rM * kx, ll[1] + Math.sin(a) * rM * ky]); }
  return { type: 'Polygon', coordinates: [ring] };
}
/** Lines can't be extruded: turn each segment into a thin ribbon polygon (w metres). */
function ribbons(fc: any, w = 7) {
  const out: any[] = [];
  for (const f of fc.features) {
    const g = f.geometry; const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const ln of lines) for (let i = 1; i < ln.length; i++) {
      const [x0, y0] = ln[i - 1], [x1, y1] = ln[i];
      const kx = 111320 * Math.cos(y0 * Math.PI / 180), ky = 110540;
      const dx = (x1 - x0) * kx, dy = (y1 - y0) * ky, len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * (w / 2) / kx, ny = (dx / len) * (w / 2) / ky;
      out.push({ type: 'Feature', properties: f.properties, geometry: { type: 'Polygon', coordinates: [[[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny], [x0 + nx, y0 + ny]]] } });
    }
  }
  return { type: 'FeatureCollection', features: out };
}
interface Slab { L: MapLayer; ids: string[]; hx: any; from: number; to: number; t0: number; opFrom: number; opTo: number; alt: number; op: number; removing: boolean; tab: HTMLElement; color: string }
const slabs = new Map<string, Slab>();
let stackGeom = { corner: [0, 0] as [number, number], center: null as [number, number] | null, gap: 200 };
let anim = 0;

function slabColor(L: MapLayer): { paint: any; tab: string; hx: any } {
  const c = L.color || '#b8b8b8';
  if (L.kind === 'zoning') return { paint: ['coalesce', ['get', 'color'], '#b8b8b8'], tab: L.data.features[0]?.properties?.color || c, hx: null };
  if (L.kind === 'choropleth') return { paint: rampOf(L), tab: '#e5b45a', hx: null };
  if (L.kind === 'heat') return { paint: ['coalesce', ['get', 'color'], '#990000'], tab: '#990000', hx: null };
  if (L.kind === 'hob') { const hx = ['to-number', ['coalesce', ['get', 'height_m'], 0]]; return { paint: ['interpolate', ['linear'], hx, 0, '#1f6f7a', 40, '#4fd8e8'], tab: '#4fd8e8', hx }; }
  return { paint: c, tab: c, hx: null };
}

function addSlab(L: MapLayer) {
  if (!map) return;
  const src = `st_${L.id}`;
  const data = L.kind === 'points' ? { type: 'FeatureCollection', features: L.data.features.filter((f: any) => f.geometry.type === 'Point').map((f: any) => ({ type: 'Feature', properties: f.properties, geometry: circlePoly(f.geometry.coordinates, 9) })) }
    : L.kind === 'lines' ? ribbons(L.data) : L.data;
  map.addSource(src, { type: 'geojson', data: data as any });
  const { paint, tab, hx } = slabColor(L);
  const ids = [src];
  map.addLayer({ id: src, type: 'fill-extrusion', source: src, paint: { 'fill-extrusion-color': paint, 'fill-extrusion-base': 0, 'fill-extrusion-height': THICK, 'fill-extrusion-opacity': 0, 'fill-extrusion-vertical-gradient': false } } as any);
  if (L.kind === 'hazard') {
    if (!map.hasImage(`hatch_${L.id}`)) map.addImage(`hatch_${L.id}`, hatchImage(L.color || '#ff8a3d'));
    map.addLayer({ id: `${src}_pat`, type: 'fill-extrusion', source: src, paint: { 'fill-extrusion-pattern': `hatch_${L.id}`, 'fill-extrusion-base': THICK, 'fill-extrusion-height': THICK + .5, 'fill-extrusion-opacity': 0 } } as any);
    ids.push(`${src}_pat`);
  }
  const t = el('div', 'slabtab', L.label); t.style.borderLeftColor = tab; $('tabs').append(t);
  slabs.set(L.id, { L, ids, hx, from: 0, to: 0, t0: 0, opFrom: 0, opTo: 1, alt: 0, op: 0, removing: false, tab: t, color: tab });
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
function stackTick() {
  if (!map) return;
  const now = performance.now();
  let busy = false, top = 0;
  for (const [key, s] of slabs) {
    const k = reduced ? 1 : (now - s.t0) / RISE;
    if (k < 1) busy = true;
    const e = ease(k);
    s.alt = s.from + (s.to - s.from) * e;
    s.op = s.opFrom + (s.opTo - s.opFrom) * Math.min(1, Math.max(0, reduced ? 1 : k * (s.removing ? 1 : 2.5)));
    const base = OP[s.L.kind] ?? .5;
    for (const id of s.ids) {
      const pat = id.endsWith('_pat');
      map.setPaintProperty(id, 'fill-extrusion-opacity', Math.min(1, base * s.op * (pat ? 1.4 : 1)));
      map.setPaintProperty(id, 'fill-extrusion-base', s.alt + (pat ? THICK : 0));
      map.setPaintProperty(id, 'fill-extrusion-height', s.hx && !pat ? ['+', s.alt, ['max', THICK, s.hx]] : s.alt + THICK + (pat ? .5 : 0));
    }
    if (s.removing && k >= 1) { s.ids.forEach((id) => map!.removeLayer(id)); map.removeSource(`st_${key}`); s.tab.remove(); slabs.delete(key); continue; }
    if (!s.removing) top = Math.max(top, s.alt);
  }
  const pillarH = top > 1 ? top + THICK : 0;
  for (const id of ['st_guide', 'st_subject']) if (map.getLayer(id)) {
    map.setPaintProperty(id, 'fill-extrusion-height', pillarH);
    map.setPaintProperty(id, 'fill-extrusion-opacity', pillarH ? (id === 'st_subject' ? .95 : .6) : 0);
  }
  placeTabs();
  if (busy) anim = requestAnimationFrame(stackTick); else anim = 0;
}

/** Label tabs sit at the data's corner, lifted to each slab's altitude on screen. */
function placeTabs() {
  if (!map) return;
  const p = map.project(stackGeom.corner);
  const lat = stackGeom.corner[1];
  const pxPerM = 512 * Math.pow(2, map.getZoom()) / (40075016.686 * Math.cos(lat * Math.PI / 180));
  const lift = pxPerM * Math.sin(map.getPitch() * Math.PI / 180);
  const W = map.getContainer().clientWidth;
  for (const s of slabs.values()) {
    const y = p.y - (s.alt + THICK / 2) * lift;
    s.tab.style.left = `${Math.max(8, Math.min(p.x + 10, W - s.tab.offsetWidth - 8))}px`;
    s.tab.style.top = `${y}px`;
    s.tab.style.opacity = String(Math.max(0, Math.min(1, s.op * 1.6 - .4)));
  }
}

function drawStack(ps: MapPayload[]) {
  if (!map) return;
  if (drawn !== 'stack') { clearData(); drawn = 'stack'; }
  const layers = uniqLayers(ps).sort((a, b) => rankOf(a) - rankOf(b));
  const center = ps.find((p) => p.center)?.center || null;
  const bb = bboxOf(layers, center);
  if (!bb) return;
  const midLat = (bb[0][1] + bb[1][1]) / 2;
  const extent = Math.max((bb[1][0] - bb[0][0]) * 111320 * Math.cos(midLat * Math.PI / 180), (bb[1][1] - bb[0][1]) * 110540);
  const gap = Math.min(400, Math.max(120, extent / 6));
  stackGeom = { corner: [bb[1][0], bb[0][1]], center, gap };
  // pillars: a pale guide at the data corner and the red line through every slab at the property
  const pillar = (id: string, ll: number[], r: number, color: string) => {
    const g = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: circlePoly(ll, r, 10) }] };
    if (map!.getSource(id)) (map!.getSource(id) as ML.GeoJSONSource).setData(g as any);
    else { map!.addSource(id, { type: 'geojson', data: g as any }); map!.addLayer({ id, type: 'fill-extrusion', source: id, paint: { 'fill-extrusion-color': color, 'fill-extrusion-base': 0, 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0 } } as any); }
  };
  pillar('st_guide', stackGeom.corner, Math.max(2.5, gap / 60), '#f0e7d9');
  if (center) pillar('st_subject', center, Math.max(3, gap / 45), '#ff3131');
  const now = performance.now();
  const keep = new Set(layers.map((L) => L.id));
  for (const [key, s] of slabs) if (!keep.has(key) && !s.removing) Object.assign(s, { removing: true, from: s.alt, to: 0, opFrom: s.op, opTo: 0, t0: now });
  let fresh = 0;
  layers.forEach((L, i) => {
    const alt = gap + i * gap;
    let s = slabs.get(L.id);
    if (!s || s.removing) {
      if (s) { s.ids.forEach((id) => map!.removeLayer(id)); map!.removeSource(`st_${L.id}`); s.tab.remove(); slabs.delete(L.id); }
      addSlab(L); s = slabs.get(L.id)!;
      Object.assign(s, { from: 0, to: alt, opFrom: 0, opTo: 1, t0: now + fresh++ * STAGGER });
    } else if (s.to !== alt) Object.assign(s, { from: s.alt, to: alt, opFrom: s.op, opTo: 1, t0: now });
  });
  setMarker(center);
  const top = gap + (layers.length - 1) * gap;
  const cam = map.cameraForBounds(bb, { padding: { top: 150, bottom: 40, left: 40, right: 110 }, bearing: map.getBearing(), pitch: 60 } as any);
  if (cam) {
    // zoom out further the taller the stack is relative to its footprint, so the top slab clears the legend
    const zoom = (cam.zoom ?? 15) - Math.log2(1 + (top / Math.max(extent, 1)) * 0.9);
    map.easeTo({ center: cam.center, zoom, pitch: 60, bearing: map.getBearing(), duration: reduced ? 0 : 1600 });
    map.once('moveend', startOrbit);
  }
  if (!anim) anim = requestAnimationFrame(stackTick);
}

function apply() {
  if (!map) return;
  const ps = currentSet;
  renderCards(ps);
  if (!ps.length) { clearData(); setMarker(null); return; }
  if (ps.length > 1 && mode === 'stack') drawStack(ps); else drawFlat(ps);
}

function show(ps: MapPayload[], m: 'stack' | 'flat') {
  currentSet = ps; mode = m;
  if (!map) {
    const c = ps.find((p) => p.center)?.center || [151.207, -33.89];
    map = new maplibregl.Map({ container: 'map', style: houseStyle(), center: c, zoom: 14.5, pitch: 55, bearing: -20,
      attributionControl: false, maxPitch: 75, canvasContextAttributes: { antialias: true } } as ML.MapOptions);
    const stop = () => { userMoved = true; cancelAnimationFrame(orbit); };
    map.on('mousedown', stop); map.on('touchstart', stop); map.on('wheel', stop); map.on('dragstart', stop);
    map.on('move', () => { if (slabs.size) placeTabs(); });
    map.on('load', apply);
  } else if (map.loaded() || map.isStyleLoaded()) apply(); else map.once('load', apply);
}

window.addEventListener('message', (e) => {
  // Only the embedding content script (our parent frame) talks to us, and only GeoJSON comes through.
  if (e.source !== window.parent) return;
  const d = e.data;
  if (d?.type === 'MBRF_MAP') show([d as MapPayload], 'flat');
  if (d?.type === 'MBRF_SET' && Array.isArray(d.payloads)) show(d.payloads as MapPayload[], d.mode === 'stack' ? 'stack' : 'flat');
});
window.parent.postMessage({ type: 'MBRF_READY' }, '*');
