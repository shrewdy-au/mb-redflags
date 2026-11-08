// NSW ePlanning "EPI_Primary_Planning_Layers" (CC BY 4.0 via SEED): Land Zoning, Height of Building, FSR, Minimum Lot Size,
// Heritage — the 33 Greater Sydney LGAs. Weekly refresh: `make refresh-weekly`.
import { loadArcgisLayer, SYDNEY_LGA_WHERE } from '../lib/arcgis.mjs';
import { step } from '../lib/state.mjs';

export const SRC = 'planning';
const BASE = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/EPI_Primary_Planning_Layers/MapServer';
export const LAYERS = [
  { source: 'epi_zoning', layer: 2, fields: 'OBJECTID,EPI_NAME,LGA_NAME,LAY_CLASS,SYM_CODE,PURPOSE,COMMENCED_DATE,CURRENCY_DATE' },
  { source: 'epi_hob', layer: 5, fields: 'OBJECTID,EPI_NAME,LGA_NAME,LAY_CLASS,SYM_CODE,MAX_B_H,MAX_B_H_M,MAX_B_H_RL,UNITS,COMMENCED_DATE' },
  { source: 'epi_fsr', layer: 1, fields: 'OBJECTID,EPI_NAME,LGA_NAME,LAY_CLASS,SYM_CODE,FSR,COMMENCED_DATE' },
  { source: 'epi_lotsize', layer: 4, fields: 'OBJECTID,EPI_NAME,LGA_NAME,LAY_CLASS,SYM_CODE,LOT_SIZE,UNITS,COMMENCED_DATE' },
  { source: 'epi_heritage', layer: 0, fields: 'OBJECTID,EPI_NAME,LGA_NAME,LAY_CLASS,H_ID,H_NAME,SIG,COMMENCED_DATE' }
];

export async function ingest() {
  for (const L of LAYERS) {
    await step(SRC, L.source, async () => {
      const n = await loadArcgisLayer({ source: L.source, layerUrl: `${BASE}/${L.layer}`, where: SYDNEY_LGA_WHERE, fields: L.fields, pageSize: 1000 });
      return `${n} features`;
    });
  }
}
