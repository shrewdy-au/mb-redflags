// ABS ASGS Edition 3 allocation files (CC BY 4.0): Mesh Block 2021 -> SA1/SA2/SA3/SA4/GCCSA, plus SAL 2021 and LGA 2025 by mesh block.
import { download } from '../lib/download.mjs';
import { q, tx } from '../lib/db.mjs';
import { step } from '../lib/state.mjs';
import { xlsxRows, cell } from '../lib/xlsx.mjs';

export const SRC = 'asgs';
const BASE = 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/allocation-files/';

async function loadSheet(file, pick, onBatch) {
  let header = null; let batch = [];
  for await (const vals of xlsxRows(file)) {
    if (!header) { header = vals.map((v) => String(v ?? '').trim()); continue; }
    const row = Object.fromEntries(header.map((h, i) => [h, cell(vals[i])]));
    const r = pick(row);
    if (r) batch.push(r);
    if (batch.length >= 5000) { await onBatch(batch); batch = []; }
  }
  if (batch.length) await onBatch(batch);
}

export async function ingest() {
  const mb = await download(BASE + 'MB_2021_AUST.xlsx', 'asgs', 'MB_2021_AUST.xlsx', { minBytes: 30_000_000, http11: true });
  const sal = await download(BASE + 'SAL_2021_AUST.xlsx', 'asgs', 'SAL_2021_AUST.xlsx', { minBytes: 15_000_000, http11: true });
  const lga = await download(BASE + 'LGA_2025_AUST.xlsx', 'asgs', 'LGA_2025_AUST.xlsx', { minBytes: 14_000_000, http11: true });

  await step(SRC, 'mesh blocks (NSW)', async () => {
    await q('TRUNCATE asgs_mb');
    let n = 0;
    await loadSheet(mb, (r) => (String(r.STATE_NAME_2021) === 'New South Wales' ? [r.MB_CODE_2021, r.MB_CATEGORY_2021, r.SA1_CODE_2021, r.SA2_CODE_2021, r.SA2_NAME_2021,
      r.SA3_CODE_2021, r.SA3_NAME_2021, r.SA4_CODE_2021, r.SA4_NAME_2021, r.GCCSA_CODE_2021, r.GCCSA_NAME_2021, r.STATE_CODE_2021, r.STATE_NAME_2021, r.AREA_ALBERS_SQKM] : null),
    async (batch) => {
      n += batch.length;
      const col = (j) => batch.map((b) => (b[j] === null || b[j] === undefined ? null : String(b[j])));
      await q(`INSERT INTO asgs_mb (mb_code, mb_category, sa1_code, sa2_code, sa2_name, sa3_code, sa3_name, sa4_code, sa4_name, gccsa_code, gccsa_name, state_code, state_name, area_sqkm)
               SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::numeric[])
               ON CONFLICT (mb_code) DO NOTHING`, [col(0), col(1), col(2), col(3), col(4), col(5), col(6), col(7), col(8), col(9), col(10), col(11), col(12), col(13)]);
    });
    return `${n} NSW mesh blocks`;
  });
  await step(SRC, 'sal', async () => {
    let n = 0;
    await loadSheet(sal, (r) => (String(r.STATE_NAME_2021) === 'New South Wales' ? [r.MB_CODE_2021, r.SAL_CODE_2021, r.SAL_NAME_2021] : null), async (batch) => {
      n += batch.length;
      await q(`UPDATE asgs_mb a SET sal_code = v.c, sal_name = v.n FROM (SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) AS t(m, c, n)) v WHERE a.mb_code = v.m`,
        [batch.map((b) => String(b[0])), batch.map((b) => String(b[1])), batch.map((b) => String(b[2]))]);
    });
    return `${n} rows`;
  });
  await step(SRC, 'lga', async () => {
    let n = 0;
    await loadSheet(lga, (r) => (String(r.STATE_NAME_2021) === 'New South Wales' ? [r.MB_CODE_2021, r.LGA_CODE_2025, r.LGA_NAME_2025] : null), async (batch) => {
      n += batch.length;
      await q(`UPDATE asgs_mb a SET lga_code = v.c, lga_name = v.n FROM (SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) AS t(m, c, n)) v WHERE a.mb_code = v.m`,
        [batch.map((b) => String(b[0])), batch.map((b) => String(b[1])), batch.map((b) => String(b[2]))]);
    });
    await q('ANALYZE asgs_mb');
    return `${n} rows`;
  });
}
