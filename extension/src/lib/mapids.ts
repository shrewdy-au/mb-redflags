// Which panel rows open the map drawer. Kept free of fetch code so the content script stays small.
export const HAZARD_KEYS = ['flood', 'historical_flood', 'bushfire', 'heritage', 'landslide', 'erosion', 'environment', 'hv_power_line'] as const;
export const MAP_ROW_IDS = new Set<string>([...HAZARD_KEYS, 'ph_area', 'ph_200', 'street', 'planning', 'max_height', 'anef', 'roads', 'easements', 'tenure', 'median_price', 'das']);
export const hasMap = (rowId: string) => MAP_ROW_IDS.has(rowId);
