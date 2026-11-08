// ABS Census 2021 General Community Profile DataPack, SA1 for NSW (CC BY 4.0): G37 tenure/landlord type, G02 medians.
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { download, run, WORK, ensureDir } from '../lib/download.mjs';
import { q, copyInto } from '../lib/db.mjs';
import { step } from '../lib/state.mjs';

export const SRC = 'census';
const URL = 'https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_SA1_for_NSW_short-header.zip';
const DIR = '2021 Census GCP Statistical Area 1 for NSW';

async function copyCsv(table, file) {
  const header = (await run('sh', ['-c', `head -1 "${file}"`])).trim().split(',');
  await q(`DROP TABLE IF EXISTS ${table}`);
  await q(`CREATE UNLOGGED TABLE ${table} (${header.map((c) => `"${c}" text`).join(', ')})`);
  await copyInto(table, createReadStream(file), { format: 'csv', delimiter: ',', header: true });
}

export async function ingest() {
  const zip = await download(URL, 'census', '2021_GCP_SA1_for_NSW_short-header.zip', { minBytes: 100_000_000 });
  const out = ensureDir(join(WORK, 'census'));
  const g37 = join(out, DIR, '2021Census_G37_NSW_SA1.csv');
  const g02 = join(out, DIR, '2021Census_G02_NSW_SA1.csv');
  if (!existsSync(g37) || !existsSync(g02)) await run('unzip', ['-o', '-q', zip, `${DIR}/2021Census_G37_NSW_SA1.csv`, `${DIR}/2021Census_G02_NSW_SA1.csv`, '-d', out]);
  await step(SRC, 'G37 + G02 -> census_sa1', async () => {
    await copyCsv('census_raw_g37', g37);
    await copyCsv('census_raw_g02', g02);
    await q('TRUNCATE census_sa1');
    await q(`
      INSERT INTO census_sa1 (sa1_code, total_occ_private, owned_outright, owned_mortgage, rented_total, rented_re_agent, rented_state_housing,
                              rented_private_landlord, rented_community, rented_other, median_hhd_income_wk, median_mortgage_month, median_rent_wk, median_age, avg_household_size)
      SELECT a."SA1_CODE_2021", a."Total_Total"::numeric, a."O_OR_Total"::numeric, a."O_MTG_Total"::numeric, a."R_Tot_Total"::numeric,
             a."R_RE_Agt_Total"::numeric, a."R_ST_h_auth_Total"::numeric, a."R_Psn_not_in_s_hh_Total"::numeric, a."R_Com_Hp_Total"::numeric,
             (a."R_Ot_landld_typ_Total"::numeric + a."R_Landld_typ_NS_Total"::numeric),
             NULLIF(b."Median_tot_hhd_inc_weekly",'')::numeric, NULLIF(b."Median_mortgage_repay_monthly",'')::numeric, NULLIF(b."Median_rent_weekly",'')::numeric,
             NULLIF(b."Median_age_persons",'')::numeric, NULLIF(b."Average_household_size",'')::numeric
      FROM census_raw_g37 a LEFT JOIN census_raw_g02 b ON b."SA1_CODE_2021" = a."SA1_CODE_2021"`);
    await q('DROP TABLE census_raw_g37; DROP TABLE census_raw_g02; ANALYZE census_sa1');
    return `${(await q('SELECT count(*)::int n FROM census_sa1')).rows[0].n} SA1s`;
  });
}
