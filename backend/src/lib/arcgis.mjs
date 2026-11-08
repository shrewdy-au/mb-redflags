// Generic ArcGIS REST layer pager -> `features` table (source, fid, props, geom). Resumable by offset.
import { getJson } from './download.mjs';
import { q, tx } from './db.mjs';
import { getCursor, setCursor } from './state.mjs';

/** Page every feature of `layerUrl` matching `where`/`geometry` into features_stage(source), then swap into features. */
export async function loadArcgisLayer({ source, layerUrl, where = '1=1', fields = '*', pageSize = 1000, geometry, idField, extraParams = {} }) {
  const cur = (await getCursor('arcgis', source)) || { offset: 0, total: null };
  if (cur.offset === 0) await q('DELETE FROM features_stage WHERE source=$1', [source]);
  const base = new URLSearchParams({ where, outFields: fields, outSR: '4326', f: 'geojson', returnGeometry: 'true', ...extraParams });
  if (geometry) { base.set('geometry', geometry); base.set('geometryType', 'esriGeometryEnvelope'); base.set('inSR', '4326'); base.set('spatialRel', 'esriSpatialRelIntersects'); }
  if (cur.total === null) {
    const c = new URLSearchParams(base); c.set('returnCountOnly', 'true'); c.set('f', 'pjson'); c.delete('outFields'); c.delete('returnGeometry');
    const j = await getJson(`${layerUrl}/query`, { method: 'POST', body: c, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    cur.total = j.count ?? null;
    console.log(`  [${source}] ${cur.total} features to page`);
  }
  let offset = cur.offset;
  for (;;) {
    const p = new URLSearchParams(base); p.set('resultOffset', String(offset)); p.set('resultRecordCount', String(pageSize));
    const j = await getJson(`${layerUrl}/query`, { method: 'POST', body: p, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 180000 });
    const feats = j.features || [];
    if (feats.length) {
      const rows = feats.map((f, i) => {
        const props = f.properties || {};
        const fid = idField ? props[idField] : (f.id ?? props.OBJECTID ?? props.objectid ?? props.fid ?? props.rid ?? offset + i);
        return [source, String(fid), JSON.stringify(props), JSON.stringify(f.geometry)];
      }).filter((r) => r[3] !== 'null');
      await tx(async (c) => {
        // one multi-row insert per page
        const vals = []; const params = [];
        rows.forEach((r, i) => { params.push(...r); vals.push(`($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3}::jsonb, ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($${i * 4 + 4}),4326))))`); });
        if (vals.length) await c.query(`INSERT INTO features_stage(source, fid, props, geom) VALUES ${vals.join(',')} ON CONFLICT (source, fid) DO UPDATE SET props=EXCLUDED.props, geom=EXCLUDED.geom`, params);
      });
    }
    offset += feats.length;
    const more = j.exceededTransferLimit === true || j.properties?.exceededTransferLimit === true || (feats.length === pageSize);
    await setCursor('arcgis', source, { offset, total: cur.total }, `${offset}/${cur.total ?? '?'}`);
    if (offset % (pageSize * 10) === 0 || !more) console.log(`  [${source}] ${offset}/${cur.total ?? '?'}`);
    if (!more || !feats.length) break;
  }
  // swap: replace the live rows for this source in one transaction (reads keep working meanwhile)
  await tx(async (c) => {
    await c.query('DELETE FROM features WHERE source=$1', [source]);
    await c.query('INSERT INTO features(source, fid, props, geom) SELECT source, fid, props, geom FROM features_stage WHERE source=$1', [source]);
    await c.query('DELETE FROM features_stage WHERE source=$1', [source]);
  });
  await setCursor('arcgis', source, { offset: 0, total: null }, `loaded ${offset}`);
  return offset;
}

// Greater Sydney: the 33 LGAs (names as ePlanning spells LGA_NAME).
export const SYDNEY_LGAS = ['BAYSIDE', 'BLACKTOWN', 'BLUE MOUNTAINS', 'BURWOOD', 'CAMDEN', 'CAMPBELLTOWN', 'CANADA BAY', 'CANTERBURY-BANKSTOWN',
  'CITY OF PARRAMATTA', 'CUMBERLAND', 'FAIRFIELD', 'GEORGES RIVER', 'HAWKESBURY', 'HORNSBY', 'HUNTERS HILL', 'INNER WEST', 'KU-RING-GAI', 'LANE COVE',
  'LIVERPOOL', 'MOSMAN', 'NORTH SYDNEY', 'NORTHERN BEACHES', 'PENRITH', 'RANDWICK', 'RYDE', 'STRATHFIELD', 'SUTHERLAND SHIRE', 'SYDNEY',
  'THE HILLS SHIRE', 'WAVERLEY', 'WILLOUGHBY', 'WOLLONDILLY', 'WOOLLAHRA'];
export const SYDNEY_LGA_WHERE = `LGA_NAME IN (${SYDNEY_LGAS.map((s) => `'${s}'`).join(',')})`;
// Envelope covering the 33 LGAs (lon/lat), for services without an LGA field.
export const SYDNEY_BBOX = '149.95,-34.35,151.65,-33.25';
