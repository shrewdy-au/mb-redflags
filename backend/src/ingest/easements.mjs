// DCS Spatial Services NSW Land Parcel and Property Theme, Easement layer (CC BY 4.0) for the Greater Sydney envelope.
// Lots are fetched live per query (Lot layer) and cached in lot_cache, so the easement yes/no is lot-intersect, not point-in-polygon.
import { loadArcgisLayer, SYDNEY_BBOX } from '../lib/arcgis.mjs';
import { step } from '../lib/state.mjs';

export const SRC = 'easements';
export async function ingest() {
  await step(SRC, 'easements', async () => `${await loadArcgisLayer({
    source: 'easements', layerUrl: 'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer/9',
    where: '1=1', fields: 'rid,cadid,easementtype,easementwidth,planoid,lastupdate', idField: 'rid', geometry: SYDNEY_BBOX, pageSize: 1000 })} easements`);
}
