// Local proxy holds the Microburbs key. The extension never sees it.
// Node scripts (scripts/smoke.mjs) can point the pipeline at another proxy port with PROXY_BASE=http://127.0.0.1:8797,
// e.g. an OPEN_DATA=1 proxy running next to the Microburbs one. The extension bundle always uses 8787.
export const PROXY_BASE: string = (globalThis as any).__MBRF_PROXY_BASE__ || 'http://127.0.0.1:8787';
// Shared header so random local pages can't use the proxy. Not a secret API key;
// change it here and in proxy/.env (EXT_TOKEN) if you want something else.
export const EXT_TOKEN = 'mb-redflags-local';
export const CONCURRENCY = 4;
export const URL_DEBOUNCE_MS = 600;
export const SAME_ADDRESS_THROTTLE_MS = 15_000; // pattern from MOGL scraper content-script
// Map drawer ("urban scanner"). Set false to ship the panel skin without the drawer.
export const MAP_DRAWER = true;
