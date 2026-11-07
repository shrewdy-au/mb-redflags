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
    add({ id: L.id, type: 'fill', paint: { 'fill-color': PH_RAMP, 'fill-opacity': .6 } }, true);
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

function renderLegend(p: MapPayload) {
  const lg = $('legend');
  lg.replaceChildren(el('h1', '', p.title), el('div', 'sub', p.sub));
  for (const it of p.legend) {
    const row = el('div', 'it');
    const sw = el('span', `sw ${it.style || 'fill'}`);
    sw.style.background = it.style === 'hatch' ? '' : it.color;
    if (it.style === 'hatch') { sw.style.backgroundColor = it.color + '55'; sw.style.color = it.color; }
    row.append(sw, el('span', '', it.label));
    lg.append(row);
  }
  lg.hidden = false;
  const info = $('info');
  if (p.card) { info.replaceChildren(el('h2', '', p.card.title), ...p.card.lines.map((l) => el('div', '', l))); info.hidden = false; } else info.hidden = true;
  const em = $('empty');
  if (p.error || p.empty) { em.replaceChildren(el('h2', '', p.error ? 'Could not load this layer' : p.empty!), el('div', '', p.error || 'Microburbs · 1 km around the address')); em.hidden = false; } else em.hidden = true;
}

let map: ML.Map | undefined;
let marker: ML.Marker | undefined;
let orbit = 0;
let userMoved = false;
let current: MapPayload | undefined;

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

function draw(p: MapPayload) {
  current = p;
  renderLegend(p);
  const apply = () => {
    if (!map || current !== p) return;
    // clear previous data layers
    for (const l of map.getStyle().layers || []) if (!['bg', 'resi', 'park', 'wood', 'water', 'rd_minor', 'rd_major', 'bld'].includes(l.id)) map.removeLayer(l.id);
    for (const s of Object.keys(map.getStyle().sources || {})) if (s.startsWith('src_')) map.removeSource(s);
    p.layers.forEach((L) => { if (L.data?.features?.length) addLayer(map!, L); });
    marker?.remove();
    if (p.center) marker = new maplibregl.Marker({ element: subjectMarker('Subject'), anchor: 'center' }).setLngLat(p.center).addTo(map);
    const bb = bboxOf(p.layers, p.center);
    const opts = { padding: { top: 120, bottom: 50, left: 40, right: 40 }, pitch: 55, bearing: map.getBearing(), maxZoom: 17, duration: reduced ? 0 : 1600 };
    if (bb) map.fitBounds(bb, opts); else if (p.center) map.easeTo({ center: p.center, zoom: 16, pitch: 55, duration: opts.duration });
    map.once('moveend', startOrbit);
  };
  if (!map) {
    map = new maplibregl.Map({ container: 'map', style: houseStyle(), center: p.center || [151.207, -33.89], zoom: 14.5, pitch: 55, bearing: -20,
      attributionControl: false, maxPitch: 70, canvasContextAttributes: { antialias: true } } as ML.MapOptions);
    const stop = () => { userMoved = true; cancelAnimationFrame(orbit); };
    map.on('mousedown', stop); map.on('touchstart', stop); map.on('wheel', stop); map.on('dragstart', stop);
    map.on('load', apply);
  } else if (map.isStyleLoaded()) apply(); else map.once('load', apply);
}

window.addEventListener('message', (e) => {
  // Only the embedding content script (our parent frame) talks to us, and only GeoJSON comes through.
  if (e.source !== window.parent) return;
  const d = e.data;
  if (d?.type === 'MBRF_MAP') draw(d as MapPayload);
});
window.parent.postMessage({ type: 'MBRF_READY' }, '*');
(window as any).__mbrfDraw = draw; // test hook (headless screenshot)
