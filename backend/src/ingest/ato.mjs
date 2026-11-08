// ATO Taxation Statistics 2023-24, Individuals Table 25 (selected items by postcode), CC BY 2.5 AU via data.gov.au.
// Negative-gearing proxy: share of individuals with net rent (landlords) and the average net rent (negative = loss).
import { download } from '../lib/download.mjs';
import { q } from '../lib/db.mjs';
import { step } from '../lib/state.mjs';
import { xlsxRows, numOrNull } from '../lib/xlsx.mjs';

export const SRC = 'ato';
const URL = 'https://data.gov.au/data/dataset/faea4485-f407-457d-97f8-3f0822ccd654/resource/d6122018-989a-453c-bd40-294990adbe40/download/ts24individual25countaveragemedianbypostcode.xlsx';
const YEAR = '2023-24';

export async function ingest() {
  const file = await download(URL, 'ato', 'ts24individual25countaveragemedianbypostcode.xlsx', { minBytes: 100_000, http11: true });
  await step(SRC, `table 25 ${YEAR}`, async () => {
    let header = null; let n = 0;
    await q('TRUNCATE ato_postcode');
    for await (const vals of xlsxRows(file, { sheet: 'Table 25' })) {
      const first = vals[0];
      if (!header) { if (first === 'Postcode') header = vals.map((v) => String(v ?? '').replace(/\s+/g, ' ').trim()); continue; }
      const pc = numOrNull(first);
      if (pc === null || pc < 200 || pc > 9999) continue;
      const row = Object.fromEntries(header.map((h, i) => [h, vals[i]]));
      const get = (re) => { const k = header.find((h) => re.test(h)); return k ? numOrNull(row[k]) : null; };
      await q(`INSERT INTO ato_postcode (postcode, income_year, individuals, net_rent_count, net_rent_avg, props) VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (postcode) DO UPDATE SET income_year=EXCLUDED.income_year, individuals=EXCLUDED.individuals, net_rent_count=EXCLUDED.net_rent_count, net_rent_avg=EXCLUDED.net_rent_avg, props=EXCLUDED.props`,
        [String(pc).padStart(4, '0'), YEAR, get(/^Individuals no\.$/), get(/^Net rent no\.$/), get(/^Average net rent \$$/),
          JSON.stringify({ proportion_with_net_rent: get(/^Proportion with net rent$/), median_net_rent: get(/^Median net rent/), median_taxable_income: get(/^Median taxable income/), average_taxable_income: get(/^Average taxable income/) })]);
      n++;
    }
    return `${n} postcodes`;
  });
}
