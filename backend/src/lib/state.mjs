// Resumable ingest bookkeeping: one row per (source, step). `make ingest` skips steps already marked done
// unless --force is given.
import { q } from './db.mjs';

export const FORCE = process.argv.includes('--force');

export async function isDone(source, step) {
  if (FORCE) return false;
  const r = await q('SELECT done FROM ingest_state WHERE source=$1 AND step=$2', [source, step]);
  return !!r.rows[0]?.done;
}
export async function getCursor(source, step) {
  const r = await q('SELECT cursor FROM ingest_state WHERE source=$1 AND step=$2', [source, step]);
  return r.rows[0]?.cursor ?? null;
}
export async function setCursor(source, step, cursor, note) {
  await q(`INSERT INTO ingest_state(source, step, cursor, note, updated_at) VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (source, step) DO UPDATE SET cursor=EXCLUDED.cursor, note=COALESCE(EXCLUDED.note, ingest_state.note), updated_at=now()`,
    [source, step, JSON.stringify(cursor ?? null), note ?? null]);
}
export async function markDone(source, step, note) {
  await q(`INSERT INTO ingest_state(source, step, done, note, updated_at) VALUES ($1,$2,true,$3,now())
           ON CONFLICT (source, step) DO UPDATE SET done=true, note=COALESCE(EXCLUDED.note, ingest_state.note), updated_at=now()`,
    [source, step, note ?? null]);
}
export async function markPending(source, step) {
  await q(`INSERT INTO ingest_state(source, step, done, updated_at) VALUES ($1,$2,false,now())
           ON CONFLICT (source, step) DO UPDATE SET done=false, updated_at=now()`, [source, step]);
}

/** Run `step` of `source` once; logs timing. */
export async function step(source, name, fn) {
  if (await isDone(source, name)) { console.log(`[${source}] ${name}: done, skipping`); return; }
  const t0 = Date.now();
  console.log(`[${source}] ${name}: start`);
  const note = await fn();
  await markDone(source, name, typeof note === 'string' ? note : null);
  console.log(`[${source}] ${name}: done in ${((Date.now() - t0) / 1000).toFixed(0)}s${note ? ` (${note})` : ''}`);
}
