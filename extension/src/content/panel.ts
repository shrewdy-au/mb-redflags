// Shadow-DOM side panel. All rendering uses textContent (no innerHTML with data).
import type { Report, Row, Status } from '../lib/types';

const CSS = `
:host { all: initial; }
.wrap { position: fixed; top: 72px; right: 12px; width: 360px; max-height: calc(100vh - 96px); z-index: 2147483646;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1b1b1b; background: #fffdf9;
  border: 1px solid #e3ddd3; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.18); display: flex; flex-direction: column; overflow: hidden; }
.wrap.min { width: auto; }
.wrap.min .body { display: none; }
.top { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #eee6da; }
.brand { font-weight: 700; letter-spacing: .02em; }
.mock { font-size: 10px; background: #ffe7a3; color: #6b4d00; border-radius: 6px; padding: 1px 6px; font-weight: 700; }
.sp { flex: 1; }
button { font: inherit; cursor: pointer; border: 1px solid #d8d0c4; background: #fff; border-radius: 8px; padding: 4px 8px; }
.body { overflow: auto; padding: 10px 12px 12px; }
.head { border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; color: #fff; }
.head .v { font-size: 22px; font-weight: 800; letter-spacing: .03em; }
.head .l { font-size: 12px; opacity: .95; }
.head.GO { background: #2f7d4f; } .head.INVESTIGATE { background: #b7791f; } .head.NO-GO { background: #b3261e; } .head.NONE { background: #6b6b6b; }
.addr { font-weight: 600; margin: 2px 0 8px; }
.row { border: 1px solid #eee6da; border-radius: 10px; margin: 6px 0; background: #fff; }
.row summary { list-style: none; display: flex; gap: 8px; align-items: flex-start; padding: 7px 9px; cursor: pointer; }
.row summary::-webkit-details-marker { display: none; }
.dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex: none; }
.dot.RED { background: #d93025; } .dot.AMBER { background: #f29900; } .dot.GREEN { background: #1e8e3e; } .dot.GREY { background: #9aa0a6; } .dot.INFO { background: #4a78c2; }
.lab { font-weight: 600; } .sum { color: #444; }
.more { padding: 0 9px 8px 27px; color: #555; font-size: 12px; }
.more div { margin-top: 2px; } .more code { font-size: 11px; background: #f5f1ea; padding: 0 3px; border-radius: 4px; }
.verify { color: #8a5a00; }
.form { display: flex; gap: 6px; margin: 6px 0; }
.form input { flex: 1; font: inherit; padding: 5px 8px; border: 1px solid #d8d0c4; border-radius: 8px; min-width: 0; }
.msg { padding: 8px; background: #f5f1ea; border-radius: 8px; margin: 6px 0; }
.foot { font-size: 11px; color: #777; margin-top: 10px; }
`;

const ORDER: Record<Status, number> = { RED: 0, AMBER: 1, GREEN: 2, GREY: 3, INFO: 4 };
const h = (tag: string, cls?: string, txt?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

export interface PanelHandlers { onManual: (address: string) => void; onAsking: (asking: number | null) => void }

export class Panel {
  private root: ShadowRoot;
  private wrap: HTMLElement;
  private body: HTMLElement;
  private mockTag: HTMLElement;
  constructor(private handlers: PanelHandlers) {
    const host = document.createElement('div');
    host.id = 'mb-redflags-host';
    document.documentElement.appendChild(host);
    this.root = host.attachShadow({ mode: 'closed' });
    const style = h('style'); style.textContent = CSS; this.root.appendChild(style);
    this.wrap = h('div', 'wrap');
    const top = h('div', 'top');
    top.append(h('span', 'brand', 'Red flags · Microburbs'));
    this.mockTag = h('span', 'mock', 'MOCK DATA'); this.mockTag.style.display = 'none'; top.append(this.mockTag);
    top.append(h('span', 'sp'));
    const tog = h('button', '', '–') as HTMLButtonElement;
    tog.title = 'Minimise';
    tog.onclick = () => { this.wrap.classList.toggle('min'); tog.textContent = this.wrap.classList.contains('min') ? '+' : '–'; };
    top.append(tog);
    this.body = h('div', 'body');
    this.wrap.append(top, this.body);
    this.root.appendChild(this.wrap);
  }

  private forms(asking?: number | null) {
    const f1 = h('form', 'form') as HTMLFormElement;
    const inp = h('input') as HTMLInputElement; inp.placeholder = 'Address, e.g. 3/12 Smith St, Waterloo NSW 2017';
    f1.append(inp, h('button', '', 'Check'));
    f1.onsubmit = (e) => { e.preventDefault(); if (inp.value.trim()) this.handlers.onManual(inp.value.trim()); };
    const f2 = h('form', 'form') as HTMLFormElement;
    const ask = h('input') as HTMLInputElement; ask.placeholder = 'Asking price you were quoted ($)'; ask.inputMode = 'numeric';
    if (asking) ask.value = String(asking);
    f2.append(ask, h('button', '', 'Compare'));
    f2.onsubmit = (e) => { e.preventDefault(); const n = Number(ask.value.replace(/[^\d.]/g, '')); this.handlers.onAsking(n > 0 ? n : null); };
    return [f2, f1];
  }

  private rowEl(r: Row) {
    const d = h('details', 'row');
    const s = h('summary');
    const txt = h('div');
    txt.append(h('div', 'lab', r.label), h('div', 'sum', r.summary));
    s.append(h('span', `dot ${r.status}`), txt);
    const more = h('div', 'more');
    const ep = h('div'); ep.append('Endpoint: ', h('code', '', r.endpoint)); more.append(ep);
    more.append(h('div', '', `Level: ${r.level}${r.distance_m !== undefined && r.distance_m !== null ? ` · distance ${Math.round(r.distance_m)} m` : ''}`));
    if (r.detail) more.append(h('div', '', r.detail));
    if (r.verify) more.append(h('div', 'verify', 'Verify on the s10.7 planning certificate before relying on this.'));
    d.append(s, more);
    return d;
  }

  minimise() { this.wrap.classList.add('min'); }

  render(r: Report) {
    this.mockTag.style.display = r.mock ? '' : 'none';
    this.body.replaceChildren();
    const head = h('div', `head ${r.state === 'done' && r.verdict ? r.verdict : 'NONE'}`);
    const label = r.state === 'done' ? r.verdict || '' : r.state === 'loading' ? 'Checking…' : r.state === 'outside' ? 'Outside coverage' : r.state === 'not_found' ? 'Address not matched' : r.state === 'error' ? 'Error' : 'Ready';
    head.append(h('div', 'v', label), h('div', 'l', r.state === 'done' ? r.verdictLine || '' : r.message || (r.state === 'idle' ? 'Type an address below.' : '')));
    this.body.append(head);
    if (r.address) this.body.append(h('div', 'addr', r.address + (r.sal ? ` · ${r.sal}` : '')));
    this.body.append(...this.forms(r.asking));
    if (r.state === 'done') {
      [...r.rows].sort((a, b) => ORDER[a.status] - ORDER[b.status]).forEach((row) => this.body.append(this.rowEl(row)));
    }
    this.body.append(h('div', 'foot', 'Decision support, not financial or legal advice. Data: Microburbs. Address matching uses G-NAF © Geoscape Australia. Only the listing address is read from this page.'));
  }
}
