// DCS Spatial Services NSW Transport Theme, RoadSegment (CC BY 4.0, "© Spatial Services"): functionhierarchy 1-4
// (motorway, primary, arterial, sub-arterial) inside the Greater Sydney envelope = "busy roads".
import { loadArcgisLayer, SYDNEY_BBOX } from '../lib/arcgis.mjs';
import { step } from '../lib/state.mjs';

export const SRC = 'roads';
export async function ingest() {
  await step(SRC, 'busy_roads', async () => `${await loadArcgisLayer({
    source: 'busy_roads', layerUrl: 'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Transport_Theme/FeatureServer/5',
    where: 'functionhierarchy IN (1,2,3,4)', fields: 'objectid,roadnamebase,roadnametype,roadnamesuffix,functionhierarchy,lanecount,surface,lastupdate',
    geometry: SYDNEY_BBOX, pageSize: 1000 })} segments`);
}
