// Threshold rules and caveats shown behind each row's "i" button.
export const RULES: Record<string, string> = {
  flood: 'RED on property · AMBER ≤100 m', historical_flood: 'RED on property · AMBER ≤100 m', bushfire: 'RED on property · AMBER ≤100 m',
  erosion: 'RED on property · AMBER ≤200 m', landslide: 'RED on property · AMBER ≤100 m', environment: 'RED on property · AMBER ≤250 m',
  hv_power_line: 'RED ≤50 m · AMBER ≤200 m', heritage: 'AMBER on property', mobile_black_spot: 'AMBER on property',
  ph_area: 'RED ≥20% · AMBER ≥10%', ph_200: 'RED ≥15% or the address itself flagged · AMBER ≥5%',
  anef: 'RED ≥25 · AMBER 20–25 · grey when no data',
  street: 'RED lower third or ≥2 pts below suburb 4-yr · GREEN upper third, above suburb, confidence ≥ Medium · grey if <10 sales or Low',
  avm: 'RED asking > AVM +10% · AMBER +3–10%', quoting: 'RED "Severe Underquoter" or median deviation ≥10%',
  investor: 'AMBER ≥60% investment-owned', mortgage_stress: 'RED ≥60 · AMBER 40–60 (score 0–100)',
  vacancy: 'RED >3% · AMBER 2–3%', yield: 'AMBER <3% for units', das: 'AMBER: demolition / new dwelling DA within 100 m',
  neg_gearing: 'Grey when the rent estimate is flagged suspect'
};
export const CAVEATS: Record<string, string> = {
  flood: 'Modelled flood extent.', anef: 'Microburb estimate, not a property contour. Check the Sydney Airport ANEF map.',
  ph_area: 'Share of homes in the SA1 (2021 Census based).', ph_200: 'Homes Microburbs flags as likely public housing.',
  street: 'Model forecast, Microburbs street model. Not a guarantee.', avm: 'Automated valuation; the asking price is typed by you.',
  tenure: '2021 Census tenure.', median_price: 'Per microburb (mesh block); the API has no SA1 price layer.',
  neg_gearing: 'Estimate at 80% LVR from Microburbs rent and rate assumptions. Not tax advice.'
};
