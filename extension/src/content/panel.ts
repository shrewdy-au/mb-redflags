// Shadow-DOM side panel in Jake's "Hand & Machine" look. All rendering uses textContent (no innerHTML with data).
// Dark ground + grain, Fraunces for the verdict and headings, JetBrains Mono for every number and label,
// signal red #ff3131 only for the hand's marks (circle round the verdict, underline on red rows).
import type { MapPayload, MapSet, Report, Row, Status } from '../lib/types';
import { hasMap } from '../lib/mapids';
import { MAP_DRAWER } from '../lib/config';
import { icon } from './icons';
import { RULES, CAVEATS } from '../lib/notes';
import { GLOSSARY } from '../lib/plain';
import { bestOf, ceilingOf, money, METHOD_TIPS } from '../lib/nextsteps';
import type { ShortItem } from '../lib/types';

const SERIF = `'MBRF Fraunces', Georgia, 'Times New Roman', serif`;
const MONO = `'MBRF Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`
)}")`;

const PANEL_W = 380;
const DRAWER_W = 520;

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { position: fixed; top: 72px; right: 12px; width: ${PANEL_W}px; max-height: calc(100vh - 96px); z-index: 2147483646;
  font: 300 13px/1.45 ${SERIF}; color: #e7e5df; background: #161616; border: 1px solid #2c2c2c; border-radius: 4px;
  box-shadow: 0 18px 50px rgba(0,0,0,.45); display: flex; flex-direction: column; overflow: hidden; isolation: isolate; }
.wrap::before { content: ''; position: absolute; inset: 0; background-image: ${GRAIN}; opacity: .045; pointer-events: none; z-index: 0; mix-blend-mode: screen; }
.wrap > * { position: relative; z-index: 1; }
.wrap.min { width: auto; }
.wrap.min .body { display: none; }
.mono { font-family: ${MONO}; }
.top { display: flex; align-items: center; gap: 10px; padding: 10px 16px; }
.lock { font: 400 10px/1 ${MONO}; letter-spacing: .14em; text-transform: uppercase; color: #9a9a96; white-space: nowrap; }
.lock b { color: #e7e5df; font-weight: 500; }
.mock { font: 500 9px/1 ${MONO}; letter-spacing: .12em; color: #161616; background: #e7e5df; padding: 3px 5px; }
.sp { flex: 1; }
button { font: 400 11px/1 ${MONO}; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; color: #e7e5df; background: transparent;
  border: 1px solid #3a3a3a; border-radius: 2px; padding: 6px 9px; }
button:hover { border-color: #e7e5df; }
button:focus-visible, input:focus-visible, summary:focus-visible { outline: 1px solid #ff3131; outline-offset: 2px; }
.body { overflow: auto; padding: 8px 16px 16px; scrollbar-width: thin; scrollbar-color: #3a3a3a transparent; }
.kicker { font: 400 10px/1 ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: #8a8a86; }
.head { position: relative; padding: 6px 0 12px; margin-bottom: 6px; }
.verdict { position: relative; display: inline-block; margin: 8px 0 4px; padding: 2px 10px 0 6px; font: 600 40px/1.05 ${SERIF}; letter-spacing: -.01em; }
.verdict.GO { color: #8fae86; } .verdict.INVESTIGATE { color: #e0a33a; } .verdict.NO-GO { color: #ff3131; } .verdict.NONE { color: #e7e5df; font-weight: 300; font-size: 30px; }
.verdict svg { position: absolute; left: -20px; top: -12px; width: calc(100% + 38px); height: calc(100% + 22px); overflow: visible; pointer-events: none; }
.hand { fill: none; stroke: #ff3131; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .7s .15s cubic-bezier(.6,.05,.3,1) forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.vline { font: 400 11.5px/1.45 ${MONO}; color: #c9c7c1; }
.addr { font: 300 17px/1.3 ${SERIF}; margin: 10px 0 2px; color: #f2f0ea; }
.sal { font: 400 10px/1.3 ${MONO}; letter-spacing: .12em; text-transform: uppercase; color: #8a8a86; margin-bottom: 8px; }
.form { display: flex; gap: 6px; margin: 6px 0; }
.form input { flex: 1; min-width: 0; font: 400 12px/1 ${MONO}; color: #e7e5df; background: #101010; border: 0; border-bottom: 1px solid #3a3a3a;
  border-radius: 0; padding: 8px 4px; }
.form input::placeholder { color: #6f6f6b; }
.form input:focus { border-bottom-color: #e7e5df; outline: none; }
.rows { margin-top: 14px; }
.modes { display: inline-flex; border: 1px solid #333; border-radius: 2px; margin: 2px 0 10px; }
.modes button { border: 0; border-radius: 0; padding: 6px 10px; color: #8a8a86; }
.modes button[aria-pressed="true"] { background: #e7e5df; color: #161616; }
.verdict.plain { font-size: 30px; font-weight: 600; }
.why { font: 300 15px/1.45 ${SERIF}; color: #e7e5df; margin: 4px 0 6px; }
.sure { font: 400 10.5px/1.5 ${MONO}; color: #8a8a86; }
.pcard { margin: 12px 0 0; padding: 10px 12px; background: #1d1d1d; border-left: 1px solid #3a3a3a; }
.pcard h3 { margin: 0 0 6px; font: 300 14px/1.2 ${SERIF}; color: #f2f0ea; }
.pcard div, .pcard li { font: 400 11px/1.55 ${MONO}; color: #c9c7c1; }
.pcard ol { margin: 0; padding-left: 18px; }
.means { font: 300 13px/1.45 ${SERIF}; color: #e7e5df; margin-top: 4px; }
.row.flag .means { color: #f2f0ea; }
.gloss { color: #e7e5df; }
.step { margin: 10px 0 0; background: #1d1d1d; border-left: 1px solid #3a3a3a; }
.step summary { list-style: none; cursor: pointer; display: flex; gap: 10px; align-items: center; padding: 9px 12px; font: 300 15px/1.2 ${SERIF}; color: #f2f0ea; }
.step summary::-webkit-details-marker { display: none; }
.step .num { width: 20px; height: 20px; flex: none; border: 1.25px solid #c9c7c1; border-radius: 50%; display: grid; place-items: center; font: 400 10px/1 ${MONO}; color: #c9c7c1; }
.step .sb { padding: 0 12px 12px 42px; font: 400 11px/1.55 ${MONO}; color: #c9c7c1; }
.step .sb p { margin: 0 0 6px; }
.step ul { margin: 0; padding-left: 16px; } .step li + li { margin-top: 3px; }
.step textarea { width: 100%; height: 150px; resize: vertical; font: 400 10.5px/1.5 ${MONO}; color: #e7e5df; background: #121212; border: 1px solid #333; padding: 8px; }
.step .acts { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.step table { width: 100%; border-collapse: collapse; font: 400 10px/1.4 ${MONO}; }
.step th, .step td { text-align: left; padding: 3px 4px 3px 0; vertical-align: top; } .step th { color: #8a8a86; font-weight: 400; }
.step .pick button[aria-pressed="true"] { background: #e7e5df; color: #161616; }
.step .ceil { font: 300 16px/1.3 ${SERIF}; color: #f2f0ea; margin: 6px 0; }
.step input { font: 400 11px/1 ${MONO}; color: #e7e5df; background: #121212; border: 0; border-bottom: 1px solid #3a3a3a; padding: 6px 4px; width: 140px; }
.row { position: relative; }
.rl { display: flex; gap: 10px; align-items: flex-start; padding: 8px 2px; border-radius: 2px; }
.row.map .rl { cursor: pointer; }
.row.map .rl:hover, .row.active .rl { background: rgba(231,229,223,.04); }
.dot { width: 6px; height: 6px; flex: none; border-radius: 50%; margin-top: 6px; }
.dot.RED { background: #ff3131; } .dot.AMBER { background: #e0a33a; } .dot.GREEN { background: #8fae86; } .dot.GREY { background: transparent; box-shadow: inset 0 0 0 1px #6b6b6b; } .dot.INFO { background: #6f6f6b; }
.ico { width: 20px; height: 20px; flex: none; fill: none; stroke: #c9c7c1; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
.txt { flex: 1; min-width: 0; }
.lab { position: relative; display: inline-block; font: 400 11.5px/1.3 ${MONO}; letter-spacing: .02em; color: #d9d7d1; }
.lab svg { position: absolute; left: -2px; bottom: -5px; width: calc(100% + 6px); height: 8px; overflow: visible; }
.sum { font: 400 11px/1.4 ${MONO}; color: #8f8d87; margin-top: 2px; }
.chart { display: block; margin: 4px 0 2px; width: 100%; height: 74px; }
.chart text { font: 400 8.5px ${MONO}; fill: #8a8a86; }
.ib { flex: none; margin-top: -2px; width: 22px; height: 22px; padding: 0; border: 0; display: grid; place-items: center; background: transparent; color: #8a8a86; }
.ib .ico { width: 16px; height: 16px; stroke: currentColor; }
.ib:hover, .ib[aria-expanded="true"], .row.active .mapb { color: #f2f0ea; }
.row.active .mapb .ico { stroke-width: 1.8; }
.note { display: none; margin: 0 0 8px 38px; padding: 8px 10px; background: #1e1e1e; border-left: 1px solid #3a3a3a; font: 400 10.5px/1.55 ${MONO}; color: #a3a19b; }
.note.open { display: block; }
.note div + div { margin-top: 3px; }
.note code { font: inherit; color: #d6d4ce; word-break: break-all; }
.verify { color: #e0a33a; }
.msg { font: 400 11.5px/1.5 ${MONO}; padding: 8px 0; color: #c9c7c1; }
.foot { font: 400 9.5px/1.5 ${MONO}; color: #6b6b67; margin-top: 18px; }

/* Map drawer: slides out from the panel's left edge. */
.drawer { position: fixed; top: 72px; right: ${12 + PANEL_W - 1}px; width: ${DRAWER_W}px; max-width: calc(100vw - ${PANEL_W + 36}px); height: 520px;
  z-index: 2147483645; background: #161616; border: 1px solid #2c2c2c; border-right: 0; border-radius: 4px 0 0 4px; overflow: hidden;
  box-shadow: -18px 18px 50px rgba(0,0,0,.45); display: flex; flex-direction: column;
  clip-path: inset(0 0 0 100%); opacity: 0; pointer-events: none; transition: clip-path .42s cubic-bezier(.6,.05,.3,1), opacity .2s; }
.drawer.open { clip-path: inset(0 0 0 0); opacity: 1; pointer-events: auto; }
.dtop { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 1px solid #2a2a2a; }
.dtitle { font: 300 16px/1.2 ${SERIF}; color: #f2f0ea; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dtop button { padding: 5px 7px; }
.dstate { font: 400 10px/1 ${MONO}; letter-spacing: .12em; text-transform: uppercase; color: #8a8a86; white-space: nowrap; }
.drawer iframe { flex: 1; width: 100%; border: 0; display: block; background: #161616; }

@media (prefers-reduced-motion: reduce) {
  .draw { animation: none; stroke-dashoffset: 0; }
  .drawer { transition: none; }
}
`;

const ORDER: Record<Status, number> = { RED: 0, AMBER: 1, GREEN: 2, GREY: 3, INFO: 4 };
const h = (tag: string, cls?: string, txt?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
const SVGNS = 'http://www.w3.org/2000/svg';
/** A hand-drawn red stroke (pen circle or underline) as inline SVG. */
function handMark(kind: 'circle' | 'underline'): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', kind === 'circle' ? '0 0 200 80' : '0 0 200 10');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', kind === 'circle'
    ? 'M112 6 C 58 2, 10 14, 8 40 C 6 66, 70 77, 120 74 C 170 71, 196 56, 193 36 C 190 14, 150 4, 96 8 C 70 10, 52 14, 40 20'
    : 'M2 6 C 40 3, 90 8, 130 5 C 160 3, 185 6, 198 4');
  p.setAttribute('class', 'hand draw');
  p.setAttribute('pathLength', '1');
  p.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(p);
  return svg;
}

/** Street forecast sparkline: history solid, forecast dashed, suburb median dotted beside it. */
function streetChart(c: NonNullable<Row['chart']>): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 300 74'); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Street price history and forecast to 2030');
  const all = [...c.street, ...c.suburb].map((p) => p[1]).filter((v) => isFinite(v));
  if (!all.length) return svg;
  const y0 = Math.min(...all), y1 = Math.max(...all);
  const X = (yr: number) => 44 + ((yr - 2024) / 6) * 246, Y = (v: number) => 58 - ((v - y0) / (y1 - y0 || 1)) * 48;
  const path = (pts: Array<[number, number]>, stroke: string, dash = '') => {
    if (pts.length < 2) return;
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', pts.map(([x, v], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(v).toFixed(1)}`).join(' '));
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', '1.25'); if (dash) p.setAttribute('stroke-dasharray', dash);
    svg.appendChild(p);
  };
  const t = (x: number, y: number, s: string, anchor = 'middle') => { const e = document.createElementNS(SVGNS, 'text'); e.setAttribute('x', String(x)); e.setAttribute('y', String(y)); e.setAttribute('text-anchor', anchor); e.textContent = s; svg.appendChild(e); };
  path(c.suburb, '#6b6b67', '1 3');
  path(c.street.filter((p) => p[0] <= c.lastYear), '#e7e5df');
  path(c.street.filter((p) => p[0] >= c.lastYear), '#e7e5df', '4 3');
  const last = c.street[c.street.length - 1];
  if (last) t(X(last[0]), Y(last[1]) - 5, `$${(last[1] / 1e6).toFixed(2)}m`, 'end');
  for (const yr of [2024, 2026, 2028, 2030]) t(X(yr), 71, String(yr));
  t(0, Y(y1) + 3, `$${(y1 / 1e6).toFixed(1)}m`, 'start'); t(0, Y(y0) + 3, `$${(y0 / 1e6).toFixed(1)}m`, 'start');
  return svg;
}

export interface PanelHandlers {
  onManual: (address: string) => void;
  onAsking: (asking: number | null) => void;
  onMap?: (rowId: string) => Promise<MapPayload>;
}

export class Panel {
  private root: ShadowRoot;
  private wrap: HTMLElement;
  private body: HTMLElement;
  private mockTag: HTMLElement;
  private drawer?: HTMLElement;
  private dTitle?: HTMLElement;
  private dState?: HTMLElement;
  private frame?: HTMLIFrameElement;
  private frameReady = false;
  private pending?: MapSet;
  private selected: string[] = [];
  private payloads = new Map<string, MapPayload>();
  private rowsById = new Map<string, Row>();
  private mode: 'stack' | 'flat' = 'stack';
  private view: 'plain' | 'detail' = 'plain';
  private shortlist: ShortItem[] = []; // in memory for this page only (nothing persistent)
  private method: 'auction' | 'private' | 'eoi' = 'auction';
  private guide: number | null = null;
  private openStep = 1;
  private last?: Report;
  private plain?: Report['plain'];
  private modeBtn?: HTMLButtonElement;
  private clearBtn?: HTMLButtonElement;
  private mapSeq = 0;
  private gnaf?: string;

  constructor(private handlers: PanelHandlers) {
    const host = document.createElement('div');
    host.id = 'mb-redflags-host';
    document.documentElement.appendChild(host);
    this.root = host.attachShadow({ mode: 'closed' });
    const style = h('style'); style.textContent = CSS; this.root.appendChild(style);
    this.wrap = h('div', 'wrap');
    const top = h('div', 'top');
    const lock = h('span', 'lock'); lock.append(h('b', '', 'MOGL'), ' · Microburbs data');
    top.append(lock);
    this.mockTag = h('span', 'mock', 'MOCK DATA'); this.mockTag.style.display = 'none'; top.append(this.mockTag);
    top.append(h('span', 'sp'));
    const tog = h('button', '', '–') as HTMLButtonElement;
    tog.title = 'Minimise';
    tog.onclick = () => {
      this.wrap.classList.toggle('min');
      tog.textContent = this.wrap.classList.contains('min') ? '+' : '–';
      if (this.wrap.classList.contains('min')) this.closeDrawer();
    };
    top.append(tog);
    this.body = h('div', 'body');
    this.wrap.append(top, this.body);
    this.root.appendChild(this.wrap);
    if (MAP_DRAWER && handlers.onMap) this.buildDrawer();
  }

  // ---------- map drawer (multi-select: each MAP row is a toggle; 2+ rows stack as floating slabs) ----------
  private buildDrawer() {
    const d = h('div', 'drawer');
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Map');
    const top = h('div', 'dtop');
    this.dTitle = h('div', 'dtitle', 'Map');
    this.dState = h('div', 'dstate', '');
    this.modeBtn = h('button', 'mode', 'Flat') as HTMLButtonElement;
    this.modeBtn.title = 'Switch between stacked slabs and a flat map';
    this.modeBtn.onclick = () => { this.mode = this.mode === 'stack' ? 'flat' : 'stack'; this.sync(); };
    this.clearBtn = h('button', '', 'Clear all') as HTMLButtonElement;
    this.clearBtn.onclick = () => this.closeDrawer();
    const close = h('button', '', '✕') as HTMLButtonElement;
    close.title = 'Close the map'; close.setAttribute('aria-label', 'Close the map');
    close.onclick = () => this.closeDrawer();
    top.append(this.dTitle, h('span', 'sp'), this.dState, this.modeBtn, this.clearBtn, close);
    d.append(top);
    this.drawer = d;
    this.root.appendChild(d);
    window.addEventListener('message', (e) => {
      if (!this.frame || e.source !== this.frame.contentWindow) return;
      if (e.data?.type === 'MBRF_READY') { this.frameReady = true; this.flush(); }
      if (e.data?.type === 'MBRF_TOGGLE' && typeof e.data.rowId === 'string') this.toggle(e.data.rowId);
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.selected.length) this.closeDrawer(); });
    // Keep the drawer the same height as the panel.
    const sync = () => { if (this.drawer) this.drawer.style.height = `${Math.max(this.wrap.offsetHeight, 460)}px`; };
    new ResizeObserver(sync).observe(this.wrap);
    sync();
  }

  private ensureFrame() {
    if (this.frame || !this.drawer) return;
    const f = document.createElement('iframe');
    f.src = chrome.runtime.getURL('drawer/drawer.html');
    f.title = 'Map';
    this.frame = f;
    this.drawer.append(f);
  }

  private flush() {
    if (!this.frame?.contentWindow || !this.frameReady || !this.pending) return;
    this.frame.contentWindow.postMessage(this.pending, new URL(chrome.runtime.getURL(''), location.href).origin);
    this.pending = undefined;
  }

  private toggle(rowId: string) {
    if (!hasMap(rowId)) return;
    const i = this.selected.indexOf(rowId);
    if (i >= 0) this.selected.splice(i, 1); else this.selected.push(rowId);
    this.sync();
  }

  /** Fetch any missing payloads (cached per address here and in the worker) and post the whole selection. */
  private async sync() {
    if (!this.drawer || !this.handlers.onMap) return;
    this.markActive();
    if (!this.selected.length) { this.closeDrawer(); return; }
    this.ensureFrame();
    const n = this.selected.length;
    this.dTitle!.textContent = n === 1 ? (this.rowsById.get(this.selected[0])?.label || 'Map') : `${n} rows`;
    this.modeBtn!.style.display = n > 1 ? '' : 'none';
    this.modeBtn!.textContent = this.mode === 'stack' ? 'Flat' : 'Stack';
    this.drawer.classList.add('open');
    const seq = ++this.mapSeq;
    const want = [...this.selected];
    if (want.some((id) => !this.payloads.has(id))) this.dState!.textContent = 'Loading…';
    await Promise.all(want.filter((id) => !this.payloads.has(id)).map(async (id) => {
      let p: MapPayload;
      try { p = await this.handlers.onMap!(id); }
      catch (e) { p = { type: 'MBRF_MAP', rowId: id, title: this.rowsById.get(id)?.label || id, sub: '', center: null, address: '', layers: [], legend: [], error: String((e as Error)?.message || e) }; }
      this.payloads.set(id, p);
    }));
    if (seq !== this.mapSeq) return;
    const payloads = want.map((id) => this.payloads.get(id)!).filter(Boolean);
    const feats = payloads.reduce((t, p) => t + p.layers.reduce((n, l) => n + (l.data?.features?.length || 0), 0), 0);
    this.dState!.textContent = `${feats} features`;
    this.pending = { type: 'MBRF_SET', payloads, mode: n > 1 ? this.mode : 'flat' };
    this.flush();
  }

  closeDrawer() {
    this.selected = []; this.mapSeq++;
    this.drawer?.classList.remove('open');
    if (this.frameReady) { this.pending = { type: 'MBRF_SET', payloads: [], mode: 'flat' }; this.flush(); }
    this.markActive();
  }

  private markActive() {
    this.body.querySelectorAll('.row').forEach((el) => {
      const on = this.selected.includes((el as HTMLElement).dataset.id || '');
      el.classList.toggle('active', on);
      const tag = el.querySelector('.mapb'); if (tag) { tag.setAttribute('aria-checked', String(on)); }
    });
  }

  // ---------- panel ----------
  private forms(asking?: number | null) {
    const f1 = h('form', 'form') as HTMLFormElement;
    const inp = h('input') as HTMLInputElement; inp.placeholder = 'Address · 3/12 Smith St, Waterloo NSW 2017';
    inp.setAttribute('aria-label', 'Address');
    f1.append(inp, h('button', '', 'Check'));
    f1.onsubmit = (e) => { e.preventDefault(); if (inp.value.trim()) this.handlers.onManual(inp.value.trim()); };
    void asking; // price compare removed (Jake, 7 Nov 2026): the AVM row shows the valuation on its own
    return [f1];
  }

  private rowEl(r: Row) {
    const mapped = MAP_DRAWER && !!this.handlers.onMap && hasMap(r.id);
    const d = h('div', `row${mapped ? ' map' : ''}`);
    d.dataset.id = r.id;
    const line = h('div', 'rl');
    const txt = h('div', 'txt');
    const lab = h('span', 'lab', r.label);
    if (r.status === 'RED') lab.append(handMark('underline'));
    txt.append(lab, h('div', 'sum', r.summary));
    if (r.chart) txt.append(streetChart(r.chart));
    const meansTxt = this.view === 'plain' ? this.plain?.means[r.id] : undefined;
    if (meansTxt) { txt.append(h('div', 'means', meansTxt)); if (r.status === 'RED' || r.status === 'AMBER') d.classList.add('flag'); }
    line.append(h('span', `dot ${r.status}`), icon(r.id), txt);
    if (mapped) {
      const m = h('button', 'ib mapb') as HTMLButtonElement;
      m.title = 'Add to the map (tick several to stack them)'; m.setAttribute('role', 'checkbox'); m.setAttribute('aria-checked', 'false');
      m.setAttribute('aria-label', `Map ${r.label}`);
      m.append(icon('map'));
      line.append(m);
      line.addEventListener('click', () => this.toggle(r.id));
    }
    const ib = h('button', 'ib') as HTMLButtonElement;
    ib.title = 'Source and notes'; ib.setAttribute('aria-label', `Notes for ${r.label}`); ib.setAttribute('aria-expanded', 'false');
    ib.append(icon('info'));
    line.append(ib);
    const note = h('div', 'note');
    const dist = r.distance_m !== undefined && r.distance_m !== null ? ` · ${Math.round(r.distance_m)} m` : '';
    if (this.view === 'plain' && GLOSSARY[r.id]) note.append(h('div', 'gloss', GLOSSARY[r.id]));
    const ep = h('div'); ep.append(h('code', '', r.endpoint)); note.append(ep);
    note.append(h('div', '', `Level: ${r.level}${dist}`));
    if (r.detail) note.append(h('div', '', r.detail));
    if (RULES[r.id]) note.append(h('div', '', `Rule: ${RULES[r.id]}`));
    if (CAVEATS[r.id]) note.append(h('div', '', CAVEATS[r.id]));
    if (r.verify) note.append(h('div', 'verify', 'Verify on the s10.7 planning certificate before relying on this.'));
    ib.addEventListener('click', (e) => { e.stopPropagation(); const o = note.classList.toggle('open'); ib.setAttribute('aria-expanded', String(o)); });
    d.append(line, note);
    return d;
  }

  /** The five Next steps cards (Plain English mode). */
  private steps(r: Report): HTMLElement[] {
    const x = r.next!, p = r.plain!;
    const card = (i: number, title: string, body: HTMLElement[]) => {
      const d = h('details', 'step') as HTMLDetailsElement; if (this.openStep === i) d.open = true;
      d.addEventListener('toggle', () => { if (d.open) this.openStep = i; });
      const s = h('summary'); s.append(h('span', 'num', String(i)), h('span', '', title));
      const sb = h('div', 'sb'); sb.append(...body); d.append(s, sb); return d;
    };
    const ul = (xs: string[]) => { const u = h('ul'); xs.forEach((t) => u.append(h('li', '', t))); return u; };
    // 2. message
    const ta = h('textarea') as HTMLTextAreaElement; ta.value = x.message; ta.setAttribute('aria-label', 'Enquiry message');
    const copy = h('button', '', 'Copy') as HTMLButtonElement;
    copy.onclick = () => { navigator.clipboard?.writeText(ta.value).then(() => { copy.textContent = 'Copied'; }, () => { ta.select(); }); };
    const a2 = h('div', 'acts'); a2.append(copy);
    // 4. shortlist
    const tbl = h('table');
    const hr = h('tr'); ['Address', 'Verdict', 'Street vs sub', 'PH %', 'Yield', 'Vac.', 'AVM'].forEach((t) => hr.append(h('th', '', t))); tbl.append(hr);
    const fmt = (v: number | null, suf = '') => (v === null ? '–' : `${v}${suf}`);
    for (const s of this.shortlist) {
      const tr = h('tr');
      [s.address.split(',')[0], s.verdict, s.street4 !== null ? `${s.street4}/${s.suburb4}%` : '–', fmt(s.ph, '%'), fmt(s.yieldPct, '%'), fmt(s.vacancy, '%'), s.avmMid ? `$${(s.avmMid / 1e6).toFixed(2)}m` : '–']
        .forEach((t) => tr.append(h('td', '', t)));
      tbl.append(tr);
    }
    const best = bestOf(this.shortlist);
    const add = h('button', '', 'Add to shortlist') as HTMLButtonElement;
    add.disabled = this.shortlist.length >= 3 || this.shortlist.some((s) => s.address === x.short.address);
    add.onclick = () => { this.shortlist.push(x.short); this.openStep = 4; this.render(r); };
    const clr = h('button', '', 'Clear') as HTMLButtonElement; clr.onclick = () => { this.shortlist = []; this.openStep = 4; this.render(r); };
    const a4 = h('div', 'acts'); a4.append(add, clr);
    const b4: HTMLElement[] = this.shortlist.length ? [tbl] : [h('p', '', 'Add up to three addresses you check to compare them side by side. Kept for this page only.')];
    if (best && this.shortlist.length > 1) b4.push(h('p', '', `Best on paper: ${best.item.address.split(',')[0]} because ${best.reason}.`));
    b4.push(a4);
    // 5. offer
    const o = x.offer;
    const pick = h('div', 'acts pick');
    for (const [k, t] of [['auction', 'Auction'], ['private', 'Private treaty'], ['eoi', 'EOI']] as const) {
      const bt = h('button', '', t) as HTMLButtonElement; bt.setAttribute('aria-pressed', String(this.method === k));
      bt.onclick = () => { this.method = k; this.openStep = 5; this.render(r); }; pick.append(bt);
    }
    const gi = h('input') as HTMLInputElement; gi.placeholder = "Agent's guide $ (optional)"; gi.inputMode = 'numeric'; if (this.guide) gi.value = String(this.guide);
    gi.onchange = () => { const v = Number(gi.value.replace(/[^\d.]/g, '')); this.guide = v > 0 ? v : null; this.openStep = 5; this.render(r); };
    const ceil = ceilingOf(o);
    const b5: HTMLElement[] = [pick, gi,
      h('p', '', `Microburbs estimate: ${money(o.avmLow)} – ${money(o.avmHigh)} (mid ${money(o.avmMid)}).`)];
    if (o.likelyPct !== null) b5.push(h('p', '', `This agency (${o.cohort || 'cohort n/a'}) sells about ${o.likelyPct}% above its guide${this.guide ? `: likely sale ≈ ${money(this.guide * (1 + o.likelyPct / 100))}` : ': likely sale ≈ guide × ' + (1 + o.likelyPct / 100).toFixed(2)}.`));
    if (ceil !== null) b5.push(h('div', 'ceil', `Your ceiling: ${money(Math.round(ceil / 1000) * 1000)}`), h('p', '', `Your call; set it before ${this.method === 'auction' ? 'auction day' : 'you offer'}. the lower of AVM high and AVM mid + 3%, less ${o.haircut}% for ${x.short.reds} red flag${x.short.reds === 1 ? '' : 's'}.`));
    b5.push(h('p', '', METHOD_TIPS[this.method]), h('p', '', 'Look on the ad for: auction date and terms, a "make an offer" form, the price guide document, the contract download.'));
    return [
      card(1, 'Enquire or not?', [h('p', '', x.enquire.rec)]),
      card(2, 'Ask on the enquiry form', [ta, a2]),
      card(3, 'At the inspection, look for', [ul(x.inspect)]),
      card(4, 'Compare with other options', b4),
      card(5, 'How much to offer', b5)
    ];
  }

  minimise() { this.wrap.classList.add('min'); }

  render(r: Report) {
    this.last = r; this.plain = r.plain;
    this.mockTag.style.display = r.mock ? '' : 'none';
    if (r.gnaf !== this.gnaf || r.state !== 'done') { this.gnaf = r.gnaf; this.payloads.clear(); this.closeDrawer(); }
    this.rowsById = new Map(r.rows.map((x) => [x.id, x]));
    this.body.replaceChildren();
    const head = h('div', 'head');
    const v = r.state === 'done' && r.verdict ? r.verdict : 'NONE';
    const label = r.state === 'done' ? r.verdict || '' : r.state === 'loading' ? 'Checking…' : r.state === 'outside' ? 'Outside coverage' : r.state === 'not_found' ? 'Address not matched' : r.state === 'error' ? 'Error' : 'Ready';
    const plainOn = this.view === 'plain' && r.state === 'done' && !!r.plain;
    const word = h('div', `verdict ${v}${plainOn ? ' plain' : ''}`, plainOn ? r.plain!.words : label);
    if (v !== 'NONE') word.append(handMark('circle'));
    if (r.state === 'done') {
      const modes = h('div', 'modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'View');
      for (const [k, t] of [['plain', 'Plain English'], ['detail', 'Detail']] as const) {
        const bt = h('button', '', t) as HTMLButtonElement; bt.setAttribute('aria-pressed', String(this.view === k));
        bt.onclick = () => { if (this.view !== k) { this.view = k; if (this.last) this.render(this.last); } };
        modes.append(bt);
      }
      head.append(modes);
    }
    if (plainOn) {
      const p = r.plain!;
      head.append(word, h('div', 'why', p.why), h('div', 'sure', `How sure is this? ${p.sure}`));
      if (r.next) head.append(...this.steps(r));
    } else head.append(word,
      h('div', 'vline', r.state === 'done' ? r.verdictLine || '' : r.message || (r.state === 'idle' ? 'Type an address below.' : '')));
    this.body.append(head);
    if (r.address) {
      this.body.append(h('div', 'addr', r.address));
      if (r.sal) this.body.append(h('div', 'sal', r.sal));
    }
    this.body.append(...this.forms(r.asking));
    if (r.state === 'done') {
      const rows = h('div', 'rows');
      [...r.rows].sort((a, b) => ORDER[a.status] - ORDER[b.status]).forEach((row) => rows.append(this.rowEl(row)));
      this.body.append(rows);
      this.markActive();
    }
    this.body.append(h('div', 'foot', 'Decision support, not financial or legal advice. Data: Microburbs. Address matching uses G-NAF © Geoscape Australia. Only the listing address is read from this page.'));
  }
}

/** Shadow DOM cannot declare @font-face, so the faces go into the host document head (extension URLs). */
export function injectFonts() {
  if (document.getElementById('mbrf-fonts')) return;
  const u = (f: string) => chrome.runtime.getURL(`fonts/${f}`);
  const css = `
@font-face { font-family: 'MBRF Fraunces'; font-style: normal; font-weight: 300 500; font-display: swap; src: url(${u('fraunces-300-latin.woff2')}) format('woff2'); }
@font-face { font-family: 'MBRF Fraunces'; font-style: normal; font-weight: 600 700; font-display: swap; src: url(${u('fraunces-600-latin.woff2')}) format('woff2'); }
@font-face { font-family: 'MBRF Fraunces'; font-style: italic; font-weight: 300 500; font-display: swap; src: url(${u('fraunces-italic-400-latin.woff2')}) format('woff2'); }
@font-face { font-family: 'MBRF Mono'; font-style: normal; font-weight: 100 800; font-display: swap; src: url(${u('jetbrains-mono-latin.woff2')}) format('woff2'); }`;
  const st = document.createElement('style');
  st.id = 'mbrf-fonts';
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
}
