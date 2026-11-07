// Microburbs hackathon coverage: City of Sydney LGA only (29 suburbs). Anything else returns 403.
// Exact SAL names are required by the suburb endpoints.
export const COVERED_SALS = [
  'Alexandria', 'Barangaroo', 'Beaconsfield (NSW)', 'Camperdown (NSW)', 'Centennial Park (NSW)',
  'Chippendale', 'Darlinghurst', 'Darlington (Sydney - NSW)', 'Dawes Point', 'Elizabeth Bay',
  'Erskineville', 'Eveleigh', 'Forest Lodge', 'Glebe (NSW)', 'Haymarket', 'Millers Point',
  'Moore Park', 'Potts Point', 'Pyrmont', 'Redfern', 'Rosebery (NSW)', 'Rushcutters Bay',
  'Surry Hills', 'Sydney', 'The Rocks (Sydney - NSW)', 'Ultimo', 'Waterloo (NSW)',
  'Woolloomooloo', 'Zetland'
] as const;

export const bareName = (sal: string) => sal.replace(/\s*\(.*\)\s*$/, '').trim();

const BARE_TO_SAL: Record<string, string> = Object.fromEntries(
  COVERED_SALS.map((s) => [bareName(s).toLowerCase(), s])
);

/** 'Waterloo' -> 'Waterloo (NSW)'; 'The Rocks' -> 'The Rocks (Sydney - NSW)'; unknown -> undefined. */
export function toSal(suburb?: string): string | undefined {
  if (!suburb) return undefined;
  const s = suburb.trim();
  if ((COVERED_SALS as readonly string[]).includes(s)) return s;
  const key = bareName(s).replace(/\s+(NSW)\s*\d{0,4}$/i, '').toLowerCase().replace(/\s+/g, ' ');
  return BARE_TO_SAL[key];
}

export const isCovered = (suburb?: string) => !!toSal(suburb);
