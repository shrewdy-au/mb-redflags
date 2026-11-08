// Quick inventory of what is loaded. `make check`.
import { q, end } from './lib/db.mjs';
const t = async (sql) => (await q(sql)).rows;
console.table(await t(`SELECT source, count(*)::int features FROM features GROUP BY 1 ORDER BY 1`));
console.table(await t(`SELECT 'address' t, count(*)::int n FROM address UNION ALL SELECT 'asgs_mb', count(*) FROM asgs_mb UNION ALL SELECT 'census_sa1', count(*) FROM census_sa1
  UNION ALL SELECT 'afford_sa2', count(*) FROM afford_sa2 UNION ALL SELECT 'ato_postcode', count(*) FROM ato_postcode UNION ALL SELECT 'bond_lodgement', count(*) FROM bond_lodgement
  UNION ALL SELECT 'gtfs_stop', count(*) FROM gtfs_stop UNION ALL SELECT 'da', count(*) FROM da UNION ALL SELECT 'area_hull', count(*) FROM area_hull UNION ALL SELECT 'lot_cache', count(*) FROM lot_cache`));
console.table(await t(`SELECT source, step, done, note, to_char(updated_at, 'YYYY-MM-DD HH24:MI') updated FROM ingest_state ORDER BY updated_at`));
await end();
