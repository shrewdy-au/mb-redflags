// Shadow-DOM side panel in Jake's "Hand & Machine" look. All rendering uses textContent (no innerHTML with data).
// Dark ground + grain, Fraunces for the verdict and headings, JetBrains Mono for every number and label,
// signal red #ff3131 only for the hand's marks (circle round the verdict, underline on red rows).
import type { MapPayload, MapSet, Report, Row, Status } from '../lib/types';
import { hasMap } from '../lib/mapids';
import { MAP_DRAWER } from '../lib/config';

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
.wrap::before { content: ''; position: absolute; inset: 0; background-image: ${GRAIN}; opacity: .07; pointer-events: none; z-index: 0; mix-blend-mode: screen; }
.wrap > * { position: relative; z-index: 1; }
.wrap.min { width: auto; }
.wrap.min .body { display: none; }
.mono { font-family: ${MONO}; }
.top { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #2a2a2a; }
.lock { font: 400 10px/1 ${MONO}; letter-spacing: .14em; text-transform: uppercase; color: #9a9a96; white-space: nowrap; }
.lock b { color: #e7e5df; font-weight: 500; }
.mock { font: 500 9px/1 ${MONO}; letter-spacing: .12em; color: #161616; background: #e7e5df; padding: 3px 5px; }
.sp { flex: 1; }
button { font: 400 11px/1 ${MONO}; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; color: #e7e5df; background: transparent;
  border: 1px solid #3a3a3a; border-radius: 2px; padding: 6px 9px; }
button:hover { border-color: #e7e5df; }
button:focus-visible, input:focus-visible, summary:focus-visible { outline: 1px solid #ff3131; outline-offset: 2px; }
.body { overflow: auto; padding: 14px 14px 14px; scrollbar-width: thin; scrollbar-color: #3a3a3a transparent; }
.kicker { font: 400 10px/1 ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: #8a8a86; }
.head { position: relative; padding: 6px 0 12px; border-bottom: 1px solid #2a2a2a; margin-bottom: 10px; }
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
.rows { margin-top: 10px; border-top: 1px solid #2a2a2a; }
.row { border-bottom: 1px solid #242424; }
.row summary { list-style: none; display: flex; gap: 10px; align-items: flex-start; padding: 9px 2px; cursor: pointer; }
.row summary::-webkit-details-marker { display: none; }
.row.map summary:hover, .row.active summary { background: rgba(231,229,223,.035); }
.row.active { box-shadow: inset 2px 0 0 #e7e5df; }
.dot { width: 7px; height: 7px; margin-top: 6px; flex: none; border-radius: 50%; }
.dot.RED { background: #ff3131; } .dot.AMBER { background: #e0a33a; } .dot.GREEN { background: #8fae86; } .dot.GREY { background: transparent; border: 1px solid #6b6b6b; } .dot.INFO { background: #8a8a86; }
.txt { flex: 1; min-width: 0; }
.lab { position: relative; display: inline-block; font: 400 14px/1.3 ${SERIF}; color: #f2f0ea; }
.lab svg { position: absolute; left: -2px; bottom: -6px; width: calc(100% + 6px); height: 9px; overflow: visible; }
.sum { font: 400 11.5px/1.45 ${MONO}; color: #b9b7b1; margin-top: 3px; }
.lvl { font: 400 9.5px/1.3 ${MONO}; letter-spacing: .12em; text-transform: uppercase; color: #77776f; margin-top: 3px; }
.maptag { flex: none; display: inline-flex; align-items: center; gap: 5px; font: 400 9.5px/1 ${MONO}; letter-spacing: .14em; color: #8a8a86; border: 1px solid #333; padding: 4px 5px; margin-top: 2px; }
.maptag::before { content: ''; width: 8px; height: 8px; border: 1px solid currentColor; box-sizing: border-box; }
.row.active .maptag::before { background: #161616; box-shadow: inset 0 0 0 1.5px #e7e5df; }
.row.active .maptag { color: #161616; background: #e7e5df; border-color: #e7e5df; }
.more { padding: 0 2px 10px 19px; font: 400 11px/1.5 ${MONO}; color: #a3a19b; }
.more div { margin-top: 3px; }
.more code { font: inherit; color: #d6d4ce; border-bottom: 1px dotted #555; }
.verify { color: #e0a33a; }
.msg { font: 400 11.5px/1.5 ${MONO}; padding: 8px 0; color: #c9c7c1; }
.foot { font: 400 10px/1.5 ${MONO}; color: #77776f; margin-top: 14px; padding-top: 10px; border-top: 1px solid #2a2a2a; }

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
      const tag = el.querySelector('.maptag'); if (tag) { tag.setAttribute('aria-checked', String(on)); }
    });
  }

  // ---------- panel ----------
  private forms(asking?: number | null) {
    const f1 = h('form', 'form') as HTMLFormElement;
    const inp = h('input') as HTMLInputElement; inp.placeholder = 'Address · 3/12 Smith St, Waterloo NSW 2017';
    inp.setAttribute('aria-label', 'Address');
    f1.append(inp, h('button', '', 'Check'));
    f1.onsubmit = (e) => { e.preventDefault(); if (inp.value.trim()) this.handlers.onManual(inp.value.trim()); };
    const f2 = h('form', 'form') as HTMLFormElement;
    const ask = h('input') as HTMLInputElement; ask.placeholder = 'Asking price quoted · $'; ask.inputMode = 'numeric';
    ask.setAttribute('aria-label', 'Asking price');
    if (asking) ask.value = String(asking);
    f2.append(ask, h('button', '', 'Compare'));
    f2.onsubmit = (e) => { e.preventDefault(); const n = Number(ask.value.replace(/[^\d.]/g, '')); this.handlers.onAsking(n > 0 ? n : null); };
    return [f2, f1];
  }

  private rowEl(r: Row) {
    const mapped = MAP_DRAWER && !!this.handlers.onMap && hasMap(r.id);
    const d = h('details', `row${mapped ? ' map' : ''}`);
    d.dataset.id = r.id;
    const s = h('summary');
    const txt = h('div', 'txt');
    const lab = h('span', 'lab', r.label);
    if (r.status === 'RED') lab.append(handMark('underline'));
    const dist = r.distance_m !== undefined && r.distance_m !== null ? ` · ${Math.round(r.distance_m)} m` : '';
    txt.append(lab, h('div', 'sum', r.summary), h('div', 'lvl', `${r.level}${dist}`));
    s.append(h('span', `dot ${r.status}`), txt);
    if (mapped) {
      const t = h('span', 'maptag', 'MAP'); t.title = 'Add this layer to the map (tick several to stack them)';
      t.setAttribute('role', 'checkbox'); t.setAttribute('aria-checked', 'false');
      s.append(t);
    }
    const more = h('div', 'more');
    const ep = h('div'); ep.append('Endpoint ', h('code', '', r.endpoint)); more.append(ep);
    more.append(h('div', '', `Level ${r.level}${dist}`));
    if (r.detail) more.append(h('div', '', r.detail));
    if (r.verify) more.append(h('div', 'verify', 'Verify on the s10.7 planning certificate before relying on this.'));
    d.append(s, more);
    if (mapped) {
      s.addEventListener('click', () => {
        this.toggle(r.id);
      });
    }
    return d;
  }

  minimise() { this.wrap.classList.add('min'); }

  render(r: Report) {
    this.mockTag.style.display = r.mock ? '' : 'none';
    if (r.gnaf !== this.gnaf || r.state !== 'done') { this.gnaf = r.gnaf; this.payloads.clear(); this.closeDrawer(); }
    this.rowsById = new Map(r.rows.map((x) => [x.id, x]));
    this.body.replaceChildren();
    const head = h('div', 'head');
    const v = r.state === 'done' && r.verdict ? r.verdict : 'NONE';
    const label = r.state === 'done' ? r.verdict || '' : r.state === 'loading' ? 'Checking…' : r.state === 'outside' ? 'Outside coverage' : r.state === 'not_found' ? 'Address not matched' : r.state === 'error' ? 'Error' : 'Ready';
    const word = h('div', `verdict ${v}`, label);
    if (v !== 'NONE') word.append(handMark('circle'));
    head.append(h('div', 'kicker', r.state === 'done' ? 'Verdict · first pass' : 'Red flags'), word,
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
