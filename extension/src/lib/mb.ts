// Fetch wrapper: extension -> local proxy -> Microburbs. The key lives only in the proxy.
import { PROXY_BASE, EXT_TOKEN } from './config';

export type MbResult<T = any> =
  | { ok: true; data: T; mock: boolean; endpoint: string }
  | { ok: false; kind: 'OUTSIDE_COVERAGE' | 'NO_DATA' | 'RATE_LIMIT' | 'ERROR'; reason?: string; message?: string; mock: boolean; endpoint: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mbGet<T = any>(path: string, params?: Record<string, string | number | undefined>): Promise<MbResult<T>> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined) qs.set(k, String(v));
  const url = `${PROXY_BASE}${path}${qs.toString() ? `?${qs}` : ''}`;
  const endpoint = path.replace(/GA[A-Z]{3}\w+/, '{gnaf}');

  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'X-Ext-Token': EXT_TOKEN, Accept: 'application/json' }, cache: 'no-store' });
    } catch (e) {
      return { ok: false, kind: 'ERROR', message: 'Proxy not reachable on 127.0.0.1:8787. Run `npm run proxy`.', mock: false, endpoint };
    }
    const mock = res.headers.get('X-MB-Mock') === '1';
    if (res.status === 429) {
      const ra = Number(res.headers.get('Retry-After')) || 2 ** attempt;
      await sleep(Math.min(ra, 10) * 1000 + Math.random() * 250);
      continue;
    }
    if (res.status === 403) return { ok: false, kind: 'OUTSIDE_COVERAGE', message: 'Outside City of Sydney coverage', mock, endpoint };
    let body: any = null;
    try { body = await res.json(); } catch { /* fallthrough */ }
    if (res.status === 404) return { ok: false, kind: 'NO_DATA', reason: 'not_found', message: body?.detail || body?.message || 'not found', mock, endpoint };
    if (!res.ok) return { ok: false, kind: 'ERROR', message: body?.error || body?.detail || `HTTP ${res.status}`, mock, endpoint };
    if (!body || body.data === null || body.data === undefined || body.available === false) {
      return { ok: false, kind: 'NO_DATA', reason: body?.reason, message: body?.message || 'no data', mock, endpoint };
    }
    return { ok: true, data: body.data as T, mock, endpoint };
  }
  return { ok: false, kind: 'RATE_LIMIT', message: 'Rate limited (429) after retries', mock: false, endpoint };
}

/** Promise.allSettled with a concurrency cap. */
export async function settledPool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try { out[i] = { status: 'fulfilled', value: await tasks[i]() }; }
      catch (reason) { out[i] = { status: 'rejected', reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}
