// Content script: read the address, ask the background for a report, render the panel.
import { readListingAddress, buildAddressInfo } from './address';
import { Panel, injectFonts } from './panel';
import { SAME_ADDRESS_THROTTLE_MS } from '../lib/config';
import type { MapPayload, ToBg, ToContent } from '../lib/types';

let panel: Panel | undefined;
let lastKey = '';
let lastAt = 0;
let lastUrl = '';

const post = (m: ToBg) => chrome.runtime.sendMessage(m).catch(() => undefined);

const ensurePanel = () => {
  if (!panel) {
    injectFonts();
    panel = new Panel({
      onManual: (text) => {
        const info = buildAddressInfo(text);
        if (info) post({ type: 'ANALYSE', address: info, url: location.href, manual: true });
        else panel?.render({ address: text, rows: [], state: 'not_found', message: 'Could not parse that address. Use: 12 Smith St, Waterloo NSW 2017' });
      },
      onAsking: (asking) => post({ type: 'ASKING', asking }),
      // The background fetches the layer through the proxy; only GeoJSON comes back (never the key).
      onMap: (rowId) => chrome.runtime.sendMessage({ type: 'MAP', rowId } satisfies ToBg) as Promise<MapPayload>
    });
  }
  return panel;
};

chrome.runtime.onMessage.addListener((msg: ToContent) => {
  if (msg?.type === 'REPORT') ensurePanel().render(msg.report);
});

function scan() {
  const info = readListingAddress();
  if (!info) {
    // No address found: offer the manual box as a minimised pill.
    if (!panel) { ensurePanel().render({ address: '', rows: [], state: 'idle' }); panel!.minimise(); }
    return;
  }
  const key = info.candidates[0];
  const now = Date.now();
  // 15 s throttle per address (pattern from the MOGL scraper) so SPA re-renders don't re-bill the API.
  if (key === lastKey && now - lastAt < SAME_ADDRESS_THROTTLE_MS) return;
  lastKey = key; lastAt = now;
  ensurePanel().render({ address: info.raw, rows: [], state: 'loading' });
  post({ type: 'ANALYSE', address: info, url: location.href });
}

// SPA navigation: poll for URL changes; background debounces too.
setInterval(() => {
  if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(scan, 800); }
}, 1000);
