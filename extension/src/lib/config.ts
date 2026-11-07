// Local proxy holds the Microburbs key. The extension never sees it.
export const PROXY_BASE = 'http://127.0.0.1:8787';
// Shared header so random local pages can't use the proxy. Not a secret API key;
// change it here and in proxy/.env (EXT_TOKEN) if you want something else.
export const EXT_TOKEN = 'mb-redflags-local';
export const CONCURRENCY = 4;
export const URL_DEBOUNCE_MS = 600;
export const SAME_ADDRESS_THROTTLE_MS = 15_000; // pattern from MOGL scraper content-script
