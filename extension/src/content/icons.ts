// Hairline icons (20x20, single 1.25 px stroke, no fills, one colour), after the reel's Hairline figures.
const W = (y: number) => `M2 ${y} q2 -2 4 0 t4 0 t4 0 t4 0`;
export const ICONS: Record<string, string> = {
  flood: `${W(6)} ${W(10)} ${W(14)}`,
  historical_flood: `${W(8)} ${W(12)} M4 17 h12`,
  bushfire: 'M10 18 c-4 0 -6 -3 -5 -6 c1 -3 3 -3 3 -7 c3 2 6 5 6 9 c0 -2 -1 -3 -2 -4 c0 3 2 4 2 6 c0 1 -2 2 -4 2 z',
  erosion: 'M2 17 L18 6 M2 17 h16 M12 4 l1 4 M15 9 l1 3',
  landslide: 'M2 17 L10 6 L18 17 z M8 13 l3 1 M11 10 l2 2',
  environment: 'M8 3 h4 M9 3 v5 l-5 9 h12 l-5 -9 v-5 M6.5 13 h7',
  hv_power_line: 'M10 2 L6 18 M10 2 L14 18 M5 6 h10 M4 10 h12 M7.5 12 l5 -6 M7 14 l6 0',
  heritage: 'M3 6 L10 2 L17 6 z M4 18 h12 M5 8 v8 M8.5 8 v8 M11.5 8 v8 M15 8 v8 M3 6 h14',
  anef: 'M4 10 a6 6 0 0 1 12 0 M6.5 10 a3.5 3.5 0 0 1 7 0 M9 10 a1 1 0 0 1 2 0 M10 11 v6',
  roads: 'M4 10 a6 6 0 0 1 12 0 M6.5 10 a3.5 3.5 0 0 1 7 0 M3 17 L7 12 M17 17 L13 12 M10 13 v1 M10 16 v1',
  ph_area: 'M2 17 V10 l3 -3 l3 3 v7 M8 17 V10 l3 -3 l3 3 v7 M14 17 V10 l2 -2 l2 2 v7 M2 17 h16',
  ph_200: 'M2 17 V10 l3 -3 l3 3 v7 M8 17 V10 l3 -3 l3 3 v7 M14 17 V10 l2 -2 l2 2 v7 M2 17 h16',
  street: 'M2 17 L7 12 L10 14 L17 5 M13 5 h4 v4 M2 18 h16',
  avm: 'M10 3 v14 M6 17 h8 M3 6 h14 M3 6 l-2 5 h4 z M17 6 l-2 5 h4 z',
  quoting: 'M3 4 h14 v9 h-8 l-4 3 v-3 h-2 z M7.5 7 l5 4 M7.5 7 h0.1 M12.5 11 h0.1',
  transport: 'M10 2 a8 8 0 1 0 0.01 0 M6.5 6.5 h7 M10 6.5 v8',
  planning: 'M5 18 V6 h7 v12 M7 9 h3 M7 12 h3 M7 15 h3 M3 18 h14 M15 3 v15 M13.5 5 L15 3 L16.5 5',
  easements: 'M3 4 h14 v12 h-14 z',
  tenure: 'M5 18 V3 h10 v15 M12 11 h0.1 M3 18 h14',
  median_price: 'M3 10 L10 3 h7 v7 l-7 7 z M14 6 h0.1',
  investor: 'M10 2 a8 8 0 1 0 8 8 h-8 z M12 1 v7 h7 a7 7 0 0 0 -7 -7',
  mortgage_stress: 'M1 11 h4 l2 -5 l3 10 l2 -7 l1 2 h6',
  neg_gearing: 'M3 3 h14 v14 h-14 z M6.5 10 h7',
  affordability: 'M4 15 a6 2 0 0 0 12 0 v-2 a6 2 0 0 0 -12 0 z M4 13 a6 2 0 0 1 12 0 M4 11 v-2 a6 2 0 0 1 12 0 v2 M4 9 a6 2 0 0 0 12 0',
  yield: 'M10 2 a8 8 0 1 0 0.01 0 M7 13 l6 -6 M7.5 7.5 h0.1 M12.5 12.5 h0.1',
  vacancy: 'M3 7 l7 -4 l7 4 v9 l-7 3 l-7 -3 z M3 7 l7 3 l7 -3 M10 10 v9',
  insurance: 'M10 2 l7 3 v5 c0 4 -3 7 -7 8 c-4 -1 -7 -4 -7 -8 v-5 z',
  max_height: 'M5 18 V6 h7 v12 M3 18 h14 M15 3 v15 M13.5 5 L15 3 L16.5 5 M13.5 16 L15 18 L16.5 16',
  das: 'M4 18 V4 M4 4 h13 M4 7 l3 -3 M17 4 v5 M15.5 9 h3 v2 h-3 z M2 18 h6 M4 10 l3 -6',
  council_rates: 'M5 2 h10 v16 l-2 -1.5 l-2 1.5 l-2 -1.5 l-2 1.5 l-2 -1.5 z M7.5 6 h5 M7.5 9 h5 M7.5 12 h3',
  mobile_black_spot: 'M7 3 h6 v14 h-6 z M9 15 h2 M3 3 L17 17',
  map: 'M2 5 l5 -2 l6 2 l5 -2 v12 l-5 2 l-6 -2 l-5 2 z M7 3 v12 M13 5 v12',
  info: 'M10 2 a8 8 0 1 0 0.01 0 M10 9 v5 M10 6 h0.1'
};
const SVGNS = 'http://www.w3.org/2000/svg';
export function icon(name: string, cls = 'ico'): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('class', cls); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.info);
  svg.appendChild(p);
  return svg;
}
