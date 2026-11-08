// Hazard layers (all CC BY, see SOURCES.md):
//  - ePlanning Hazard: Flood Planning (LEP flood planning area — only Hornsby + two SEPP precincts inside Greater Sydney), Landslide Risk Land
//  - ePlanning Protection: Acid Sulfate Soils class, Airport Noise (LEP ANEF contours: Bankstown, Camden, RAAF Richmond, Liverpool…)
//  - ePlanning SEPP (Precincts—Western Parkland City) 2021: Western Sydney Airport ANEC contours
//  - NSW RFS Bush Fire Prone Land (hosted feature service on Spatial Services, "CC by NSW RFS")
//  - Spatial Services Administrative Boundaries: Mine Subsidence Districts
//  - NSW EPA Contaminated Sites (notified sites, points) on portal.data.nsw.gov.au
//  - NSW Coastal Erosion 2025 (SEED shapefiles, loaded with ogr2ogr in the gdal container)
// Sydney Airport ANEF 2045 is NOT loaded: it exists only as a PDF (no open vector data). See README "no open data".
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadArcgisLayer, SYDNEY_LGA_WHERE, SYDNEY_BBOX } from '../lib/arcgis.mjs';
import { download, run, WORK, ensureDir, BACKEND } from '../lib/download.mjs';
import { q, DATABASE_URL } from '../lib/db.mjs';
import { step } from '../lib/state.mjs';

export const SRC = 'hazards';
const EP = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning';
export const ARCGIS = [
  { source: 'epi_flood', url: `${EP}/Hazard/MapServer/1`, where: `${SYDNEY_LGA_WHERE} OR LGA_NAME = '' OR LGA_NAME IS NULL`, fields: 'OBJECTID,EPI_NAME,LGA_NAME,LAY_CLASS,COMMENCED_DATE', geometry: SYDNEY_BBOX },
  { source: 'epi_landslide', url: `${EP}/Hazard/MapServer/2`, where: SYDNEY_LGA_WHERE, fields: 'OBJECTID,EPI_NAME,LGA_NAME,LAY_CLASS,COMMENCED_DATE' },
  { source: 'epi_ass', url: `${EP}/Protection/MapServer/1`, where: SYDNEY_LGA_WHERE, fields: 'OBJECTID,EPI_NAME,LGA_NAME,LAY_CLASS,COMMENCED_DATE' },
  { source: 'epi_anef', url: `${EP}/Protection/MapServer/2`, where: '1=1', fields: 'OBJECTID,EPI_NAME,LGA_NAME,LAY_NAME,ANEF_CODE,COMMENCED_DATE' },
  { source: 'wsa_anec', url: `${EP}/SEPP_Precincts_Western_Parkland_City_2021/MapServer/26`, where: '1=1', fields: 'OBJECTID,EPI_NAME,MAP_NAME,LAY_NAME,ANEF_CODE,COMMENCED_DATE' },
  { source: 'rfs_bfpl', url: 'https://portal.spatial.nsw.gov.au/server/rest/services/Hosted/NSW_BushFire_Prone_Land/FeatureServer/0', where: '1=1', fields: 'fid,category,d_category,guideline,d_guidelin,lastupdate', geometry: SYDNEY_BBOX, pageSize: 500 },
  { source: 'mine_subsidence', url: 'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Administrative_Boundaries_Theme_multiCRS/FeatureServer/7', where: '1=1', fields: 'OBJECTID,cadid,districtname,lastupdate', idField: 'cadid' },
  { source: 'epa_contaminated', url: 'https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/Contaminated_Sites/FeatureServer/0', where: '1=1', fields: 'objectid,suburb,sitename,address,contaminationactivitytype,managementclass,latitude,longitude' }
];
const COASTAL_PICKS = [['coastal_erosion', '_2020_Rq_0990_Erase'], ['coastal_erosion_2100', '_ssp245_2100_Rq_0500_Erase']];
const COASTAL = [
  { name: 'open_coast_beaches.zip', url: 'https://datasets.seed.nsw.gov.au/dataset/0ce0682e-f179-474f-96e3-e81483054f9a/resource/e4c8ebfc-1ad6-46ce-90ac-69e4ceef4648/download/open_coast_beaches.zip', min: 300_000_000 },
  { name: 'bay_and_estuary_beaches.zip', url: 'https://datasets.seed.nsw.gov.au/dataset/0ce0682e-f179-474f-96e3-e81483054f9a/resource/c97a6b22-8fe4-4fea-9432-9d397e0e5c75/download/bay_and_estuary_beaches.zip', min: 40_000_000 }
];

export async function ingest() {
  for (const L of ARCGIS) {
    await step(SRC, L.source, async () => `${await loadArcgisLayer({ source: L.source, layerUrl: L.url, where: L.where, fields: L.fields, geometry: L.geometry, pageSize: L.pageSize || 1000, idField: L.idField })} features`);
  }
  // Coastal erosion: 2,904 scenario shapefiles (5 SSPs x decades 2020-2150 x 4 exceedance quantiles). Phase 1 loads two:
  //   coastal_erosion      = present-day hazard extent, 2020 baseline, Rq 0.990 (conservative)        -> the extension's erosion row
  //   coastal_erosion_2100 = SSP2-4.5, 2100, Rq 0.500 (median)                                         -> detail only
  // Change COASTAL_PICKS to use another scenario; see the DCCEEW technical report for the Rq definition.
  await step(SRC, 'coastal_erosion', async () => {
    const out = ensureDir(join(WORK, 'coastal'));
    for (const c of COASTAL) {
      const zip = await download(c.url, 'coastal', c.name, { minBytes: c.min });
      const dir = ensureDir(join(out, c.name.replace('.zip', '')));
      if (!existsSync(join(dir, '.extracted'))) { await run('unzip', ['-o', '-q', zip, '-d', dir]); await run('touch', [join(dir, '.extracted')]); }
    }
    let loaded = 0;
    const pgHost = DATABASE_URL.includes('127.0.0.1') || DATABASE_URL.includes('localhost') ? 'host.docker.internal' : null;
    const pg = DATABASE_URL.replace('postgres://', '').replace(/^(\w+):(\w+)@([^:/]+):?(\d+)?\/(\w+)$/, (_, u, pw, h, port, db) => `host=${pgHost || h} port=${port || 5432} dbname=${db} user=${u} password=${pw}`);
    for (const [source, pattern] of COASTAL_PICKS) {
      const shps = (await run('sh', ['-c', `find "${out}" -iname '*${pattern}*.shp'`])).split('\n').filter(Boolean);
      if (!shps.length) { console.log(`  no shapefiles match ${pattern}`); continue; }
      await q('DROP TABLE IF EXISTS coastal_stage');
      for (const shp of shps) {
        const rel = shp.replace(join(BACKEND, 'data'), '/data');
        await run('docker', ['compose', '--profile', 'tools', 'run', '--rm', 'gdal', '-f', 'PostgreSQL', `PG:${pg}`, rel, '-nln', 'coastal_stage', '-t_srs', 'EPSG:4326', '-nlt', 'PROMOTE_TO_MULTI', '-lco', 'GEOMETRY_NAME=geom', '-append', '-skipfailures', '-q'], { cwd: BACKEND });
        loaded++;
      }
      await q(`DELETE FROM features WHERE source=$1`, [source]);
      await q(`INSERT INTO features (source, fid, props, geom)
               SELECT $1, row_number() OVER ()::text, (to_jsonb(s) - 'geom' - 'ogc_fid') || jsonb_build_object('scenario', $2::text), ST_Multi(ST_MakeValid(geom))
               FROM coastal_stage s WHERE geom IS NOT NULL AND ST_Intersects(geom, ST_MakeEnvelope(${SYDNEY_BBOX}, 4326))`, [source, pattern]);
      await q('DROP TABLE IF EXISTS coastal_stage');
      console.log(`  ${source}: ${shps.length} shapefiles -> ${(await q('SELECT count(*)::int n FROM features WHERE source=$1', [source])).rows[0].n} features in the Sydney envelope`);
    }
    return `${loaded} shapefiles`;
  });
}
