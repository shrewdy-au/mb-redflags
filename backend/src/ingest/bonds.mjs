// NSW Fair Trading rental bond lodgement files (CC BY via data.nsw.gov.au; monthly xlsx on fairtrading.nsw.gov.au).
// fairtrading.nsw.gov.au sits behind a Cloudflare JavaScript challenge, so scripted downloads get an HTML page back.
// Manual step: save the monthly files into backend/data/raw/bonds/ (rentalbond_lodgements_<month>_<year>.xlsx);
// this loader ingests every xlsx it finds there and skips anything that is not a real workbook.
import { readdirSync, existsSync, statSync, openSync, readSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { RAW, ensureDir, download } from '../lib/download.mjs';
import { q } from '../lib/db.mjs';
import { isDone, markDone } from '../lib/state.mjs';
import { xlsxRows, numOrNull } from '../lib/xlsx.mjs';

export const SRC = 'bonds';
const PAGE = 'https://www.fairtrading.nsw.gov.au/about-fair-trading/rental-bond-data';

function isXlsx(file) {
  if (!existsSync(file) || statSync(file).size < 2000) return false;
  const fd = openSync(file, 'r'); const b = Buffer.alloc(2); readSync(fd, b, 0, 2, 0); closeSync(fd);
  return b[0] === 0x50 && b[1] === 0x4b; // "PK"
}

export async function ingest() {
  const dir = ensureDir(join(RAW, 'bonds'));
  // Best effort: try the last 12 monthly URLs with a plain client UA. If the host answers with HTML, we leave it to the manual step.
  const now = new Date();
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toLocaleString('en-AU', { month: 'long' }).toLowerCase(); const year = d.getFullYear();
    const pub = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const name = `rentalbond_lodgements_${month}_${year}.xlsx`;
    const file = join(dir, name);
    if (existsSync(file)) continue;
    const url = `https://www.fairtrading.nsw.gov.au/sites/default/files/noindex/${pub.getFullYear()}-${String(pub.getMonth() + 1).padStart(2, '0')}/${name}`;
    try { await download(url, 'bonds', name); } catch { /* ignore */ }
    if (existsSync(file) && !isXlsx(file)) { unlinkSync(file); console.log(`  ${name}: host returned a challenge page, not a workbook (manual download from ${PAGE})`); break; }
  }
  const files = readdirSync(dir).filter((f) => /\.xlsx$/i.test(f)).map((f) => join(dir, f)).filter(isXlsx);
  if (!files.length) { console.log(`  no bond workbooks in ${dir}. Download them from ${PAGE} (CC BY) and rerun \`make ingest-bonds\`.`); return; }
  for (const file of files) {
    const base = file.split('/').pop();
    if (await isDone(SRC, base)) continue;
    let header = null; let n = 0;
    await q('DELETE FROM bond_lodgement WHERE src_file=$1', [base]);
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      await q(`INSERT INTO bond_lodgement (src_file, lodged, postcode, dwelling_type, bedrooms, weekly_rent)
               SELECT $1, * FROM unnest($2::date[], $3::text[], $4::text[], $5::smallint[], $6::numeric[])`,
        [base, batch.map((b) => b[0]), batch.map((b) => b[1]), batch.map((b) => b[2]), batch.map((b) => b[3]), batch.map((b) => b[4])]);
      n += batch.length; batch = [];
    };
    for await (const vals of xlsxRows(file)) {
      const cells = vals.map((v) => (v instanceof Date ? v : typeof v === 'string' ? v.trim() : v));
      if (!header) {
        const joined = cells.map((c) => String(c ?? '').toLowerCase()).join('|');
        if (/postcode/.test(joined) && /rent/.test(joined)) header = cells.map((c) => String(c ?? '').toLowerCase());
        continue;
      }
      const col = (re) => { const i = header.findIndex((h) => re.test(h)); return i >= 0 ? cells[i] : null; };
      const lodged = col(/lodgement date|date/); const pc = col(/postcode/); const dt = col(/dwelling type/); const bed = col(/bedroom/); const rent = col(/weekly rent/);
      const pcs = pc === null ? null : String(numOrNull(pc) ?? pc).padStart(4, '0');
      if (!pcs || !/^\d{4}$/.test(pcs)) continue;
      batch.push([lodged instanceof Date ? lodged.toISOString().slice(0, 10) : typeof lodged === 'string' && /\d{4}/.test(lodged) ? lodged : null, pcs, dt ? String(dt) : null, numOrNull(bed), numOrNull(rent)]);
      if (batch.length >= 5000) await flush();
    }
    await flush();
    await markDone(SRC, base, `${n} bonds`);
    console.log(`  ${base}: ${n} bonds`);
  }
  await q('ANALYZE bond_lodgement');
}
