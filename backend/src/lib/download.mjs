// Resumable downloads into backend/data/raw/<source>/. Uses curl (-C -) so a dropped 1.8 GB G-NAF fetch resumes.
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW = join(BACKEND, 'data', 'raw');
export const WORK = join(BACKEND, 'data', 'work');
export const UA = 'Mozilla/5.0 mb-redflags-backend/0.1 (open data ingest)';

export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts });
    let out = '';
    p.stdout?.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

/** Download url to data/raw/<sub>/<name>; skip if present and non-empty (or `minBytes` reached). */
export async function download(url, sub, name, { minBytes = 1, http11 = false } = {}) {
  const dir = join(RAW, sub);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  if (existsSync(file) && statSync(file).size >= minBytes) return file;
  const args = ['-sS', '-L', '-C', '-', '--retry', '5', '--retry-delay', '5', '-A', UA, '-o', file, url];
  if (http11) args.unshift('--http1.1');
  console.log(`  download ${name}`);
  try { await run('curl', args); }
  catch (e) {
    // curl exits 33 when the server ignores a resume range for an already-complete file.
    if (!(existsSync(file) && statSync(file).size >= minBytes)) throw e;
  }
  return file;
}

/** Fetch JSON with a browser-ish UA and a timeout; retries transient errors. */
export async function getJson(url, { headers = {}, timeout = 120000, retries = 4, method = 'GET', body } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { method, body, headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeout) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 120)} ${text.slice(0, 200)}`);
      const j = JSON.parse(text);
      if (j?.error) throw new Error(`API error ${JSON.stringify(j.error).slice(0, 200)}`);
      return j;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

/** Stream one member of a zip without extracting the whole archive. */
export function unzipStream(zip, member) {
  const p = spawn('unzip', ['-p', zip, member], { stdio: ['ignore', 'pipe', 'inherit'] });
  return p.stdout;
}
export async function unzipList(zip) {
  const out = await run('unzip', ['-Z1', zip]);
  return out.split('\n').filter(Boolean);
}
export function ensureDir(p) { mkdirSync(p, { recursive: true }); return p; }
