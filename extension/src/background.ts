// Service worker: wires tabs to the pipeline.
// API responses live only in an in-memory per-tab Map (never chrome.storage), per Microburbs licence terms.
import { runAnalysis, finish } from './lib/pipeline';
import type { Bundle } from './lib/rules';
import { URL_DEBOUNCE_MS } from './lib/config';
import type { AddressInfo, Report, ToBg, ToContent } from './lib/types';

interface TabState { seq: number; bundle?: Bundle; report: Report }
const tabs = new Map<number, TabState>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

chrome.tabs.onRemoved.addListener((id) => { tabs.delete(id); clearTimeout(timers.get(id)); timers.delete(id); });

const send = (tabId: number, report: Report) => {
  const msg: ToContent = { type: 'REPORT', report };
  chrome.tabs.sendMessage(tabId, msg).catch(() => undefined);
};

chrome.runtime.onMessage.addListener((msg: ToBg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
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
  const st: TabState = { seq, report: { address: a.raw, rows: [], state: 'loading', asking } };
  tabs.set(tabId, st);
  const out = await runAnalysis(a, asking, () => tabs.get(tabId)?.seq !== seq, (r) => send(tabId, r));
  if (!out) return; // superseded by a newer address
  st.bundle = out.bundle;
  st.report = out.report;
  send(tabId, st.report);
}
