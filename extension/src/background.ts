// Service worker: wires tabs to the pipeline.
// API responses live only in an in-memory per-tab Map (never chrome.storage), per Microburbs licence terms.
import { runAnalysis, finish } from './lib/pipeline';
import type { Bundle } from './lib/rules';
import { URL_DEBOUNCE_MS, PROXY_BASE, EXT_TOKEN } from './lib/config';
import { buildMapPayload } from './lib/maplayers';
import type { MbResult } from './lib/mb';
import type { AddressInfo, MapPayload, Report, ToBg, ToContent } from './lib/types';

// geo: map-layer responses for the drawer, in memory only, dropped with the TabState on the next address.
interface TabState { seq: number; bundle?: Bundle; report: Report; geo: Map<string, Promise<MbResult>> }
const tabs = new Map<number, TabState>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

chrome.tabs.onRemoved.addListener((id) => { tabs.delete(id); clearTimeout(timers.get(id)); timers.delete(id); });

const send = (tabId: number, report: Report) => {
  const msg: ToContent = { type: 'REPORT', report };
  chrome.tabs.sendMessage(tabId, msg).catch(() => undefined);
};

chrome.runtime.onMessage.addListener((msg: ToBg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  if (msg.type === 'MAP') {
    mapFor(tabId, msg.rowId).then(sendResponse, (e) => sendResponse({ type: 'MBRF_MAP', rowId: msg.rowId, title: 'Map', sub: '', center: null,
      address: '', layers: [], legend: [], error: String(e?.message || e) } satisfies MapPayload));
    return true; // async sendResponse
  }
  if (msg.type === 'AI_STATUS') {
    fetch(`${PROXY_BASE}/health`, { headers: { 'X-Ext-Token': EXT_TOKEN } }).then((r) => r.json()).then((j) => sendResponse(!!j?.ai), () => sendResponse(false));
    return true;
  }
  if (msg.type === 'AI_NEXT') {
    const st = tabs.get(tabId);
    if (!st?.report?.rows?.length) { sendResponse({ error: 'Run a check first.' }); return; }
    // Only the derived rows go to the proxy (label, status, short value), never raw API payloads.
    const rows = st.report.rows.map((r) => ({ label: r.label, status: r.status, summary: r.summary }));
    fetch(`${PROXY_BASE}/ai/next-steps`, { method: 'POST', headers: { 'X-Ext-Token': EXT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict: st.report.verdict, method: msg.method, rows }) })
      .then((r) => r.json()).then((j) => sendResponse(j?.data ? { data: j.data } : { error: j?.error || 'AI failed' }), () => sendResponse({ error: 'Proxy not reachable' }));
    return true;
  }
  if (msg.type === 'ANALYSE') {
    // Debounce SPA URL churn: only the last address inside the window runs.
    clearTimeout(timers.get(tabId));
    timers.set(tabId, setTimeout(() => analyse(tabId, msg.address).catch((e) => {
      send(tabId, { address: msg.address.raw, rows: [], state: 'error', message: String(e?.message || e) });
    }), msg.manual ? 0 : URL_DEBOUNCE_MS));
  } else if (msg.type === 'ASKING') {
    const st = tabs.get(tabId);
    if (!st?.bundle) return;
    st.bundle.asking = msg.asking;
    st.report = finish(st.report, st.bundle);
    send(tabId, st.report);
  }
});

async function analyse(tabId: number, a: AddressInfo) {
  const prev = tabs.get(tabId);
  const seq = (prev?.seq || 0) + 1;
  const asking = prev?.bundle?.asking ?? null;
  const st: TabState = { seq, report: { address: a.raw, rows: [], state: 'loading', asking }, geo: new Map() };
  tabs.set(tabId, st);
  const out = await runAnalysis(a, asking, () => tabs.get(tabId)?.seq !== seq, (r) => send(tabId, r));
  if (!out) return; // superseded by a newer address
  st.bundle = out.bundle;
  // Seed the drawer cache with suburb layers the analysis already fetched, so opening their maps costs nothing.
  if (out.report.sal && out.bundle) {
    const S = `/v1/suburbs/${encodeURIComponent(out.report.sal)}`;
    const b = out.bundle;
    const seed: Array<[string, any]> = [[`${S}/development/zoning-map`, b.zoning], [`${S}/development/building-controls`, b.controls],
      [`${S}/demographics/tenure`, b.tenure], [`${S}/market/median-price-map?property_type=${b.ptype || 'house'}`, b.priceMap], [`${S}/development/applications`, b.das]];
    for (const [k, v] of seed) if (v?.ok) st.geo.set(k, Promise.resolve(v));
  }
  st.report = out.report;
  send(tabId, st.report);
}

async function mapFor(tabId: number, rowId: string): Promise<MapPayload> {
  const st = tabs.get(tabId);
  const b = st?.bundle;
  if (!st || !b || !st.report.sal) {
    return { type: 'MBRF_MAP', rowId, title: 'Map', sub: '', center: null, address: '', layers: [], legend: [], error: 'Run a check first.' };
  }
  return buildMapPayload(rowId, { gnaf: b.gnaf, sal: st.report.sal, address: st.report.address, bundle: b, cache: st.geo });
}
