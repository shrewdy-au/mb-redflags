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
// OPEN_DATA=1: answer the open-data-backed paths from the local PostGIS (backend/), pass the rest (street forecast,
// agent quoting) to Microburbs as before. See backend/README.md. Needs `cd backend && npm install && make ingest`.
const OPEN_DATA = process.env.OPEN_DATA === '1' || process.env.OPEN_DATA === 'true';
let openApi = null;
if (OPEN_DATA) {
  try { openApi = await import(new URL('../backend/src/api.mjs', import.meta.url)); }
  catch (e) { console.error(`OPEN_DATA=1 but backend/src/api.mjs failed to load: ${e?.message || e}`); process.exit(1); }
}
// Optional AI rewrite of the Next steps (paid Anthropic API key in proxy/.env). Without it the templates are the feature.
// (No temperature: this model rejects it; the JSON-only system prompt keeps output tight.)
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_SYSTEM = `You help a first-time property buyer in Sydney who knows nothing about property. You get a list of checks about one
listing (label, status RED/AMBER/GREEN/GREY/INFO, a short value). Write five short sections in plain English a 15-year-old understands:
enquire (should they enquire, one or two sentences), ask (3-4 questions for the agent's enquiry form), inspect (4-6 things to look at
during the inspection), compare (one sentence on what to compare against other options), offer (two or three sentences on setting a
walk-away price for the sale method). Use only the facts given; never invent numbers; this is general information, not advice.
Reply with JSON only: {"enquire": string, "ask": string[], "inspect": string[], "compare": string, "offer": string}.`;
async function readBody(req, limit = 65536) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('body too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}
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
  // Map drawer layers (GeoJSON), fetched only when the user opens a row's map.
  /^\/v1\/suburbs\/[^/]+\/shapes\/(hazards|public-housing-sa1|noise-heatmap|busy-roads|easements)$/,
  /^\/v1\/suburbs\/[^/]+\/development\/(zoning-map|building-controls)$/,
  // v3 rows: tenure, market and development layers.
  /^\/v1\/suburbs\/[^/]+\/shapes\/mesh-blocks$/,
  /^\/v1\/suburbs\/[^/]+\/market\/(median-price-map|investor-concentration|mortgage-stress|affordability|yield-pct|yield-map|vacancy-rate|vacancy-map)$/,
  /^\/v1\/suburbs\/[^/]+\/development\/(applications|council-rates)$/,
  /^\/v1\/properties\/[A-Za-z0-9]+\/valuation\/negative-gearing$/,
  // Used only by scripts/ (demo listing pick + held-out check), never by the extension.
  /^\/v1\/suburbs\/[^/]+\/(listings\/for-sale|properties|demographics\/tenure)$/,
  // Open-data-only routes (OPEN_DATA=1): no Microburbs equivalent, served from backend/ PostGIS.
  /^\/v1\/properties\/[A-Za-z0-9]+\/development\/applications$/,
  /^\/v1\/suburbs\/[^/]+\/(demographics\/income|market\/(median-rent|negative-gearing))$/
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
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'X-Ext-Token, Accept, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST', 'Vary': 'Origin' }
    : {};
  if (req.method === 'OPTIONS') { res.writeHead(origin.startsWith('chrome-extension://') ? 204 : 403, cors); return res.end(); }
  // Origin check: browsers always send Origin on cross-origin fetches; only extensions are allowed.
  // Requests with no Origin (curl, scripts/holdout.mjs) still need the shared token.
  if (origin && !origin.startsWith('chrome-extension://')) return send(res, 403, { error: 'origin not allowed' });
  if (req.headers['x-ext-token'] !== EXT_TOKEN) return send(res, 401, { error: 'missing or bad X-Ext-Token' }, cors);
  if (req.method === 'POST' && req.url === '/ai/next-steps') {
    if (!AI_KEY) return send(res, 503, { error: 'ANTHROPIC_API_KEY not set in proxy/.env' }, cors);
    try {
      const inp = JSON.parse(await readBody(req));
      // Only derived rows (label/status/value), never raw API payloads.
      const rows = (Array.isArray(inp.rows) ? inp.rows : []).slice(0, 40).map((r) => ({ label: String(r.label || '').slice(0, 80), status: String(r.status || ''), value: String(r.summary || '').slice(0, 160) }));
      const user = `Verdict: ${String(inp.verdict || '')}. Sale method: ${String(inp.method || 'unknown')}.\nChecks:\n${rows.map((r) => `- ${r.label} [${r.status}]: ${r.value}`).join('\n')}`;
      const up = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(30000),
        headers: { 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 600, system: AI_SYSTEM, messages: [{ role: 'user', content: user }] })
      });
      const j = await up.json();
      if (!up.ok) return send(res, 502, { error: j?.error?.message || `AI HTTP ${up.status}` }, cors);
      const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      let out; try { out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { out = { enquire: text }; }
      console.log(`${new Date().toISOString()} AI next-steps ok`);
      return send(res, 200, { data: out }, cors);
    } catch (e) {
      return send(res, 502, { error: 'AI request failed' }, cors);
    }
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' }, cors);

  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/health') {
    let open_data = OPEN_DATA ? { enabled: true } : { enabled: false };
    if (openApi) { try { open_data = { enabled: true, ...(await openApi.health()) }; } catch (e) { open_data = { enabled: true, error: 'database not reachable' }; } }
    return send(res, 200, { ok: true, mock: MOCK, key_loaded: !!MB_KEY, ai: !!AI_KEY, open_data }, cors);
  }
  if (!url.pathname.startsWith('/v1/') || !ALLOW.some((re) => re.test(url.pathname))) {
    return send(res, 404, { error: 'endpoint not on allowlist' }, cors);
  }

  if (openApi) {
    // Open-data path first; null means "Microburbs-only row" (street/profile, agent-quoting) and falls through.
    const t0 = Date.now();
    try {
      const r = await openApi.handle(decodeURIComponent(url.pathname), url.searchParams);
      if (r) {
        console.log(`${new Date().toISOString()} ${r.status} ${url.pathname} ${Date.now() - t0}ms [open-data]`);
        return send(res, r.status, r.body, { ...cors, 'X-MB-Mock': '0', 'X-Open-Data': '1' });
      }
    } catch (e) {
      console.log(`${new Date().toISOString()} ERR ${url.pathname} open-data: ${e?.message || e}`);
      return send(res, 500, { error: 'open-data query failed', detail: String(e?.message || e) }, cors);
    }
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
  console.log(`mb-redflags proxy on http://${HOST}:${PORT}  mode=${MOCK ? `MOCK (${fixtures.length} synthetic fixtures)` : 'LIVE'}${OPEN_DATA ? ' + OPEN_DATA (PostGIS for everything but forecast/quoting)' : ''}  key=${MB_KEY ? 'loaded' : 'MISSING'}  base=${MB_BASE}`);
});
