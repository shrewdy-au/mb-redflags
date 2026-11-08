// Regional Data Hub (DITRDCA) "Census Mortgage and Rent Affordability Indicators for LGAs and SA2s" 2021 (CC BY).
// MAID/RAID: households paying more than 30% of income on the mortgage / rent.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { download } from '../lib/download.mjs';
import { q } from '../lib/db.mjs';
import { step } from '../lib/state.mjs';

export const SRC = 'afford';
const URL = 'https://aueprod01ckanstg.blob.core.windows.net/public-catalogue/0d55c321-e301-457f-aac0-19a04edf7fff/2021%20MAID%20RAID%20x%20HIED.csv';

function splitCsv(line) {
  const out = []; let cur = ''; let inq = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inq && line[i + 1] === '"') { cur += '"'; i++; } else inq = !inq; }
    else if (ch === ',' && !inq) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}

export async function ingest() {
  const file = await download(URL, 'rdh', '2021_MAID_RAID_x_HIED.csv', { minBytes: 1_000_000 });
  await step(SRC, 'SA2 MAID/RAID', async () => {
    const by = new Map();
    let header = null;
    for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      const cells = splitCsv(line);
      if (!header) { if (cells[0] === 'CENSUS_YEAR') header = cells; continue; }
      const r = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
      if (r.GEOGRAPHY_LEVEL !== 'SA2 2021') continue;
      const code = r.GEOGRAPHY_CODE_2021;
      const o = by.get(code) || { name: r.GEOGRAPHY_NAME_2021, props: {} };
      const total = Number(r.Total) || 0;
      const cat = r.Affordability_Indicator_Category;
      o.props[cat] = total;
      by.set(code, o);
    }
    await q('TRUNCATE afford_sa2');
    for (const [code, o] of by) {
      const p = o.props;
      const mHh = p['Total households with a mortgage'] ?? null;
      const mStress = p['Households where mortgage repayments are more than 30% of household income'] ?? null;
      const rHh = p['Total renting households'] ?? null;
      const rStress = p['Households where rent payments are more than 30% of household income'] ?? null;
      const pct = (a, b) => (a !== null && b ? Math.round((a / b) * 1000) / 10 : null);
      await q(`INSERT INTO afford_sa2 (sa2_code, sa2_name, mortgage_hh, mortgage_stress_hh, mortgage_stress_pct, rent_hh, rent_stress_hh, rent_stress_pct, props)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [code, o.name, mHh, mStress, pct(mStress, mHh), rHh, rStress, pct(rStress, rHh), JSON.stringify(p)]);
    }
    return `${by.size} SA2s`;
  });
}
