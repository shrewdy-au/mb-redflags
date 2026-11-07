// Vercel serverless proxy for the Microburbs hackathon API (team MOGL).
// The key lives ONLY in Vercel environment variables (MB_KEY); it never reaches the browser or the repo.
// Same allowlist and no-store rules as proxy/server.mjs; GET only.
const ALLOW = [
  /^\/v1\/geocode\/address$/,
  /^\/v1\/geocode\/suburb$/,
  /^\/v1\/properties\/[A-Za-z0-9]+\/(profile|risks\/all|surroundings\/public-housing|street\/profile|valuation\/avm|valuation\/agent-quoting|transport\/nearby|valuation\/negative-gearing)$/,
  /^\/v1\/suburbs\/[^/]+\/risks\/(extras|property-hazard-counts)$/,
  /^\/v1\/suburbs\/[^/]+\/shapes\/(hazards|public-housing-sa1|noise-heatmap|busy-roads|easements|mesh-blocks)$/,
  /^\/v1\/suburbs\/[^/]+\/development\/(zoning-map|building-controls|applications|council-rates)$/,
  /^\/v1\/suburbs\/[^/]+\/market\/(median-price-map|investor-concentration|mortgage-stress|affordability|yield-pct|yield-map|vacancy-rate|vacancy-map)$/,
  /^\/v1\/suburbs\/[^/]+\/demographics\/tenure$/,
];
export default async function handler(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'X-Ext-Token, Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'no-store' };
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const key = process.env.MB_KEY || '';
  if (!key) return res.status(503).json({ error: 'proxy not configured' });
  const token = process.env.EXT_TOKEN || 'mb-redflags-local';
  if ((req.headers['x-ext-token'] || '') !== token) return res.status(401).json({ error: 'missing or bad X-Ext-Token' });
  const url = new URL(req.url, 'http://x');
  const path = url.searchParams.get('path') || url.pathname.replace(/^\/api\/mb/, '');
  if (path === '/health') return res.status(200).json({ ok: true, hosted: true, key_loaded: true });
  if (!path.startsWith('/v1/') || !ALLOW.some((re) => re.test(path))) return res.status(404).json({ error: 'endpoint not on allowlist' });
  const qs = new URLSearchParams(url.searchParams); qs.delete('path');
  const base = (process.env.MB_BASE || 'https://api-ht.microburbs.com.au').replace(/\/+$/, '');
  const up = await fetch(`${base}${path}${qs.toString() ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'Mozilla/5.0 (Macintosh) mb-redflags-hosted/0.1', Accept: 'application/json' },
  });
  const body = await up.text();
  res.status(up.status).setHeader('Content-Type', 'application/json');
  if (up.headers.get('retry-after')) res.setHeader('Retry-After', up.headers.get('retry-after'));
  return res.send(body);
}
