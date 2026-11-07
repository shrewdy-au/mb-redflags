export type Status = 'RED' | 'AMBER' | 'GREEN' | 'GREY' | 'INFO';
export type Level = 'property' | '200 m' | 'mesh block' | 'SA1' | 'street' | 'suburb' | 'agency';

export interface Row {
  id: string;
  label: string;
  status: Status;
  summary: string;
  endpoint: string;
  level: Level;
  distance_m?: number | null;
  detail?: string;
  verify?: boolean; // show 'verify on s10.7' note
  chart?: { street: Array<[number, number]>; suburb: Array<[number, number]>; lastYear: number }; // street forecast sparkline
}

export type Verdict = 'GO' | 'INVESTIGATE' | 'NO-GO';

export interface Report {
  address: string;
  gnaf?: string;
  sal?: string;
  verdict?: Verdict;
  verdictLine?: string;
  rows: Row[];
  state: 'idle' | 'loading' | 'done' | 'outside' | 'not_found' | 'error';
  message?: string;
  mock?: boolean;
  asking?: number | null;
  plain?: Plain;
  next?: NextSteps;
}

export interface ShortItem { address: string; verdict: Verdict; reds: number; streetGap: number | null; street4: number | null; suburb4: number | null;
  ph: number | null; yieldPct: number | null; vacancy: number | null; avmMid: number | null }
export interface NextSteps {
  enquire: { rec: string };
  message: string;
  inspect: string[];
  short: ShortItem;
  offer: { avmLow: number | null; avmMid: number | null; avmHigh: number | null; likelyPct: number | null; cohort: string; haircut: number; comps: number | null };
}

/** Plain English view (deterministic templates). */
export interface Plain { words: string; why: string; means: Record<string, string>; questions: string[]; pay?: string; sure: string }

export interface AddressInfo {
  raw: string;
  street?: string; // "3/12 Smith St"
  unit?: string;
  number?: string;
  streetName?: string; // "Smith St"
  suburb?: string;
  state?: string;
  postcode?: string;
  candidates: string[]; // query strings to try against geocode, in order
}

// content <-> background messages
export type ToBg =
  | { type: 'ANALYSE'; address: AddressInfo; url: string; manual?: boolean }
  | { type: 'ASKING'; asking: number | null }
  | { type: 'MAP'; rowId: string }
  | { type: 'AI_STATUS' }
  | { type: 'AI_NEXT'; method: string };
export type ToContent = { type: 'REPORT'; report: Report };

// Map drawer payload: background -> content (sendResponse) -> drawer iframe (postMessage). GeoJSON only, no key.
export type MapLayerKind = 'hazard' | 'choropleth' | 'points' | 'zoning' | 'hob' | 'heat' | 'lines';
export interface MapLayer { id: string; kind: MapLayerKind; label: string; color?: string; data: any; prop?: string; ramp?: Array<[number, string]> }
export interface LegendItem { label: string; color: string; style?: 'fill' | 'hatch' | 'line' | 'dot' | 'box' }
export interface MapPayload {
  type: 'MBRF_MAP';
  rowId: string;
  title: string;          // e.g. "Flood (modelled)"
  sub: string;            // mono line under the title
  center: [number, number] | null; // [lng, lat]
  address: string;
  layers: MapLayer[];
  legend: LegendItem[];
  card?: { title: string; lines: string[] };
  empty?: string;         // "No mapped flood within 1 km"
  error?: string;
}

/** content -> drawer: the whole current selection. mode 'stack' floats 2+ layers as slabs. */
export interface MapSet { type: 'MBRF_SET'; payloads: MapPayload[]; mode: 'stack' | 'flat' }
