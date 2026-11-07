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
}

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
  | { type: 'ASKING'; asking: number | null };
export type ToContent = { type: 'REPORT'; report: Report };
