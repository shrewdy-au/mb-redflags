#!/usr/bin/env node
// Dependency-free local proxy: extension -> 127.0.0.1:8787 -> Microburbs.
// Holds the key (proxy/.env MB_KEY) so it never reaches the page or the extension bundle.
// Never logs the key, never caches or stores responses (Cache-Control: no-store).
import http from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// --- tiny .env loader (process env wins) ---
const envFile = join(here, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const MB_KEY = process.env.MB_KEY || '';
const MB_BASE = (process.env.MB_BASE || 'https://api-ht.microburbs.com.au').replace(/\/+$/, '');
const EXT_TOKEN = process.env.EXT_TOKEN || 'mb-redflags-local';
const MOCK = process.env.MOCK === '1' || process.env.MOCK === 'true';
const PORT = Number(process.env.PORT || 8787);
const HOST = '127.0.0.1';
// Cloudflare rejects default script user agents (error 1010); send a browser-like one.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 mb-redflags/0.1';

// --- allowlist: only the endpoints this extension uses ---
const ALLOW = [
  /^\/v1\/geocode\/address$/,
  /^\/v1\/geocode\/suburb$/,
  /^\/v1\/properties\/[A-Za-z0-9]+\/(profile|risks\/all|surroundings\/public-housing|street\/profile|valuation\/avm|valuation\/agent-quoting|transport\/nearby)$/,
  /^\/v1\/suburbs\/[^/]+\/risks\/(extras|property-hazard-counts)$/,
  // Used only by scripts/ (demo listing pick + held-out check), never by the extension.
  /^\/v1\/suburbs\/[^/]+\/(listings\/for-sale|properties|demographics\/tenure)$/
];

// --- token bucket: 8 req/s (API allows ~10) ---
const RATE = 8;
let tokens = RATE;
let lastRefill = Date.now();
const waiters = [];
function take() {
  return new Promise((resolve) => { waiters.push(resolve); drain(); });
}
function drain() {
  const now = Date.now();
  tokens = Math.min(RATE, tokens + ((now - lastRefill) / 1000) * RATE);
  lastRefill = now;
  while (waiters.length && tokens >= 1) { tokens -= 1; waiters.shift()(); }
  if (waiters.length) setTimeout(drain, Math.ceil(1000 / RATE));
}

// --- mock fixtures ---
let fixtures = [];
function loadFixtures() {
  const dir = join(root, 'fixtures', 'synthetic');
  fixtures = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}
function mockResponse(path, query) {
  if (path === '/v1/geocode/address') {
    const q = (query.get('address') || '').toLowerCase();
    const fx = fixtures.find((f) => (f.match_suburbs || []).some((s) => q.includes(s)));
    if (!fx) return { status: 200, body: { data: [] } };
    // Echo the queried street as the abbr so the extension's street-number match succeeds on any listing in that suburb.
    const street = (query.get('address') || '').split(',')[0].toUpperCase().replace(/\s+/g, ' ').trim();
    const c = fx.routes['/v1/geocode/address'].data[0];
    return { status: 200, body: { data: [{ ...c, abbr: `${street} ${fx.suburb_upper}`, display_name: `${c.display_name} (synthetic)` }] } };
  }
  for (const f of fixtures) if (f.routes[path]) return { status: 200, body: f.routes[path] };
  return { status: 200, body: { data: null, available: false, reason: 'mock_missing', message: `No synthetic fixture for ${path}` } };
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const cors = origin.startsWith('chrome-extension://')
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'X-Ext-Token, Accept', 'Vary': 'Origin' }
    : {};
  if (req.method === 'OPTIONS') { res.writeHead(origin.startsWith('chrome-extension://') ? 204 : 403, cors); return res.end(); }
  // Origin check: browsers always send Origin on cross-origin fetches; only extensions are allowed.
  // Requests with no Origin (curl, scripts/holdout.mjs) still need the shared token.
  if (origin && !origin.startsWith('chrome-extension://')) return send(res, 403, { error: 'origin not allowed' });
  if (req.headers['x-ext-token'] !== EXT_TOKEN) return send(res, 401, { error: 'missing or bad X-Ext-Token' }, cors);
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' }, cors);

  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/health') return send(res, 200, { ok: true, mock: MOCK, key_loaded: !!MB_KEY }, cors);
  if (!url.pathname.startsWith('/v1/') || !ALLOW.some((re) => re.test(url.pathname))) {
    return send(res, 404, { error: 'endpoint not on allowlist' }, cors);
  }

  if (MOCK) {
    const r = mockResponse(decodeURIComponent(url.pathname), url.searchParams);
    return send(res, r.status, r.body, { ...cors, 'X-MB-Mock': '1' });
  }
  if (!MB_KEY) return send(res, 503, { error: 'MB_KEY not set in proxy/.env (or run with MOCK=1)' }, cors);

  await take();
  const t0 = Date.now();
  try {
    const up = await fetch(`${MB_BASE}${url.pathname}${url.search}`, {
      headers: { Authorization: `Bearer ${MB_KEY}`, Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(20000)
    });
    const text = await up.text();
    const extra = { ...cors, 'X-MB-Mock': '0' };
    const ra = up.headers.get('retry-after');
    if (ra) extra['Retry-After'] = ra;
    console.log(`${new Date().toISOString()} ${up.status} ${url.pathname} ${Date.now() - t0}ms`);
    return send(res, up.status, text, extra);
  } catch (e) {
    console.log(`${new Date().toISOString()} ERR ${url.pathname} ${e?.name || e}`);
    return send(res, 502, { error: 'upstream fetch failed' }, cors);
  }
});

if (MOCK) loadFixtures();
server.listen(PORT, HOST, () => {
  console.log(`mb-redflags proxy on http://${HOST}:${PORT}  mode=${MOCK ? `MOCK (${fixtures.length} synthetic fixtures)` : 'LIVE'}  key=${MB_KEY ? 'loaded' : 'MISSING'}  base=${MB_BASE}`);
});
