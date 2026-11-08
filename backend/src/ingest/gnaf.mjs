// Open G-NAF (Geoscape, via data.gov.au, CC BY 4.0 + open G-NAF EULA). NSW files only, streamed out of the zip.
import { download, unzipStream, unzipList, run } from '../lib/download.mjs';
import { q, copyInto } from '../lib/db.mjs';
import { step } from '../lib/state.mjs';

export const SRC = 'gnaf';
const ZIP_URL = 'https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc/resource/b023544a-5836-4d43-b6d8-da2f73e8d2bf/download/g-naf_aug26_allstates_gda2020_psv_110.zip';
const ZIP_NAME = 'g-naf_aug26_allstates_gda2020_psv_110.zip';

const FILES = {
  address_detail: 'NSW_ADDRESS_DETAIL_psv.psv',
  address_default_geocode: 'NSW_ADDRESS_DEFAULT_GEOCODE_psv.psv',
  street_locality: 'NSW_STREET_LOCALITY_psv.psv',
  locality: 'NSW_LOCALITY_psv.psv',
  address_mesh_block_2021: 'NSW_ADDRESS_MESH_BLOCK_2021_psv.psv',
  mb_2021: 'NSW_MB_2021_psv.psv',
  street_type_aut: 'Authority_Code_STREET_TYPE_AUT_psv.psv',
  flat_type_aut: 'Authority_Code_FLAT_TYPE_AUT_psv.psv'
};

async function headerOf(zip, member) {
  const out = await run('sh', ['-c', `unzip -p "${zip}" "${member}" | head -1`]);
  return out.trim().split('|').map((c) => c.toLowerCase());
}

export async function ingest() {
  const zip = await download(ZIP_URL, 'gnaf', ZIP_NAME, { minBytes: 1_800_000_000 });
  const members = await unzipList(zip);
  for (const [table, file] of Object.entries(FILES)) {
    const member = members.find((m) => m.endsWith('/' + file));
    if (!member) throw new Error(`${file} not in zip`);
    await step(SRC, `copy ${table}`, async () => {
      const cols = await headerOf(zip, member);
      const t = `gnaf_raw_${table}`;
      await q(`DROP TABLE IF EXISTS ${t}`);
      await q(`CREATE UNLOGGED TABLE ${t} (${cols.map((c) => `"${c}" text`).join(', ')})`);
      await copyInto(t, unzipStream(zip, member), { format: 'csv', delimiter: '|', header: true });
      const n = (await q(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
      return `${n} rows`;
    });
  }
  await step(SRC, 'build address', async () => {
    await q(`CREATE INDEX IF NOT EXISTS gnaf_raw_adg_pid ON gnaf_raw_address_default_geocode (address_detail_pid)`);
    await q(`CREATE INDEX IF NOT EXISTS gnaf_raw_amb_pid ON gnaf_raw_address_mesh_block_2021 (address_detail_pid)`);
    await q(`CREATE INDEX IF NOT EXISTS gnaf_raw_mb_pid ON gnaf_raw_mb_2021 (mb_2021_pid)`);
    await q('TRUNCATE address');
    // bulk load without the trigram / gist indexes, then rebuild them (5x faster than maintaining them per row)
    for (const ix of ['address_geom_idx', 'address_search_trgm', 'address_loc_num', 'address_mb', 'address_postcode']) await q(`DROP INDEX IF EXISTS ${ix}`);
    await q(`
      INSERT INTO address (gnaf_pid, flat_type, flat_number, level_number, number_first, number_last, street_name, street_type, street_abbr,
                           locality, postcode, state, mb_2021, legal_parcel_id, confidence, abbr, search_text, geom)
      SELECT d.address_detail_pid,
             NULLIF(d.flat_type_code,''), NULLIF(concat(d.flat_number_prefix, d.flat_number, d.flat_number_suffix),''),
             NULLIF(concat(d.level_number_prefix, d.level_number, d.level_number_suffix),''),
             NULLIF(concat(d.number_first_prefix, d.number_first, d.number_first_suffix),''),
             NULLIF(concat(d.number_last_prefix, d.number_last, d.number_last_suffix),''),
             s.street_name, NULLIF(s.street_type_code,''), st.name,
             l.locality_name, NULLIF(d.postcode,''), 'NSW', mb.mb_2021_code, NULLIF(d.legal_parcel_id,''), NULLIF(d.confidence,'')::smallint,
             upper(concat_ws(' ',
               CASE WHEN NULLIF(concat(d.flat_number_prefix, d.flat_number, d.flat_number_suffix),'') IS NOT NULL
                    THEN concat(d.flat_number_prefix, d.flat_number, d.flat_number_suffix) || '/' || concat(d.number_first_prefix, d.number_first, d.number_first_suffix)
                    ELSE concat(d.number_first_prefix, d.number_first, d.number_first_suffix) ||
                         CASE WHEN d.number_last IS NOT NULL THEN '-' || concat(d.number_last_prefix, d.number_last, d.number_last_suffix) ELSE '' END END,
               s.street_name, COALESCE(st.name, s.street_type_code), l.locality_name)),
             lower(concat_ws(' ', concat(d.number_first_prefix, d.number_first, d.number_first_suffix), s.street_name, COALESCE(st.name, s.street_type_code), l.locality_name, d.postcode)),
             ST_SetSRID(ST_MakePoint(g.longitude::double precision, g.latitude::double precision), 4326)::geography
      FROM gnaf_raw_address_detail d
      JOIN gnaf_raw_address_default_geocode g ON g.address_detail_pid = d.address_detail_pid AND g.date_retired IS NULL
      JOIN gnaf_raw_street_locality s ON s.street_locality_pid = d.street_locality_pid
      JOIN gnaf_raw_locality l ON l.locality_pid = d.locality_pid
      LEFT JOIN gnaf_raw_street_type_aut st ON st.code = s.street_type_code
      LEFT JOIN gnaf_raw_address_mesh_block_2021 amb ON amb.address_detail_pid = d.address_detail_pid AND amb.date_retired IS NULL
      LEFT JOIN gnaf_raw_mb_2021 mb ON mb.mb_2021_pid = amb.mb_2021_pid
      WHERE d.date_retired IS NULL AND d.number_first IS NOT NULL
      ON CONFLICT (gnaf_pid) DO NOTHING`);
    await q('CREATE INDEX IF NOT EXISTS address_geom_idx ON address USING gist (geom)');
    await q('CREATE INDEX IF NOT EXISTS address_search_trgm ON address USING gin (search_text gin_trgm_ops)');
    await q('CREATE INDEX IF NOT EXISTS address_loc_num ON address (locality, number_first)');
    await q('CREATE INDEX IF NOT EXISTS address_mb ON address (mb_2021)');
    await q('CREATE INDEX IF NOT EXISTS address_postcode ON address (postcode)');
    await q('ANALYZE address');
    const n = (await q('SELECT count(*)::int AS n FROM address')).rows[0].n;
    return `${n} addresses`;
  });
  await step(SRC, 'drop raw', async () => {
    for (const t of ['address_detail', 'address_default_geocode', 'address_mesh_block_2021', 'mb_2021']) await q(`DROP TABLE IF EXISTS gnaf_raw_${t}`);
    return 'kept locality, street_locality and authority tables';
  });
}
