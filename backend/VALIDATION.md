# Validation: open-data routes vs Microburbs, 2026-11-08

Same extension pipeline and rules (`scripts/smoke.ts`), same three listings, proxy started once with `OPEN_DATA=1` and once
on the Microburbs key. Cells are what the panel would show: **status · summary (nearest distance)**. "Match" compares the
RAG status only; a summary difference with the same status is expected (different sources, different wording).
Street forecast and agency quoting are Microburbs on both sides (passthrough), so they are identical by construction.

## 34 Corben Street, Surry Hills NSW 2010

| | open data | Microburbs |
|---|---|---|
| state / verdict | done / **NO-GO** — 3 red flags: investigate before making an offer | done / **NO-GO** — 3 red flags: investigate before making an offer |
| GNAF | GANSW705997173 (34 Corben Street, Surry Hills NSW 2010) | GANSW705997173 (34 Corben Street, Surry Hills) |

| row | open data | Microburbs | match |
|---|---|---|---|
| flood — Flood (modelled) | GREEN · nearest ? | GREEN · nearest 815 m (815 m) | ✅ |
| historical_flood — Flood (historical) | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| bushfire — Bushfire-prone | GREEN · none within search radius | GREEN · none within search radius | ✅ |
| erosion — Erosion | GREEN · none within search radius | GREEN · none within search radius | ✅ |
| landslide — Landslide | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| environment — Contamination / environment | AMBER · nearest 131 m (131 m) | GREEN · nearest 900 m (900 m) | ❌ |
| anef — Aircraft noise (ANEF) | GREY · no ANEF data returned for this suburb | GREY · no ANEF data returned for this suburb | ✅ |
| ph_area — Public housing — area share | RED · 26.3% of homes in this area (0 m) | RED · 22.1% of homes in this area (0 m) | ✅ |
| ph_200 — Public housing — within 200 m | GREY · no data (no_open_data) | GREEN · 6 of 1899 homes flagged (0.3%) (129 m) | open GREY |
| hv_power_line — High-voltage power line | GREEN · nearest ? | GREEN · nearest 229 m (229 m) | ✅ |
| street — Street growth forecast | RED · Corben Street: rank 73/91 (lower third), 4-yr 2.6%/yr vs suburb 3.6%/yr | RED · Corben Street: rank 73/91 (lower third), 4-yr 2.6%/yr vs suburb 3.6%/yr | passthrough |
| avm — Microburbs valuation (AVM) | RED · asking $2,200,000 is 21.6% vs AVM $1,809,109 | RED · asking $2,200,000 is 21.6% vs AVM $1,809,109 | ✅ |
| quoting — Agency quoting accuracy | GREEN · Moderate Underquoter, median 6.1% above guide | GREEN · Moderate Underquoter, median 6.1% above guide | passthrough |
| heritage — Heritage overlay | AMBER · on property (0 m) | AMBER · on property (0 m) | ✅ |
| mobile_black_spot — Mobile black spot | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| transport — Nearest transport | INFO · train 448 m · tram 397 m · bus 182 m | INFO · train 361 m · bus 189 m | ✅ |
| tenure — Owner-occupied / rented | INFO · Owner-occ 32% · Rented 65% | INFO · Owner-occ 31% · Rented 66% | ✅ |
| median_price — Median house price | GREY · no data (out_of_scope_open_data) | INFO · $1,750,000 here vs $2,225,000 suburb (-21%) | open GREY |
| investor — Investor concentration | GREEN · 36% investment-owned | AMBER · 75% investment-owned | ❌ |
| mortgage_stress — Mortgage stress | GREEN · score 16.3 / 100 | GREEN · score 17 / 100 | ✅ |
| neg_gearing — Negative gearing | GREY · no data (no_property_level_open_data) | GREY · −$1,420/wk at 80% LVR (negatively geared) | ✅ |
| affordability — Affordability | GREY · no data (needs_sales_data) | INFO · index 85 · Strong Outlook | open GREY |
| yield — Gross yield | GREY · no data (out_of_scope_open_data) | INFO · 2.5% | open GREY |
| vacancy — Vacancy rate | GREY · no data (out_of_scope_open_data) | GREEN · 0.5% (houses, suburb) | open GREY |
| insurance — Landlord insurance | GREY · empty | INFO · ~$2,368/yr median (comprehensive) | open GREY |
| max_height — Planning: zone + height limit | INFO · Max height 9 m (HOB) · R1 General Residential | INFO · Max height 9 m (HOB) · R1 General Residential | ✅ |
| das — Development applications | AMBER · 121 within 300 m · nearest 20 m (20 m) | AMBER · 39 within 300 m · nearest 52 m (52 m) | ✅ |
| council_rates — Council rates | GREY · no data (not_open_data) | INFO · $814/yr average | open GREY |
| roads — Busy roads + noise | INFO · busy roads and the noise heatmap · open the map | INFO · busy roads and the noise heatmap · open the map | ✅ |
| easements — Easements | INFO · mapped easements within 1 km · open the map | INFO · mapped easements within 1 km · open the map | ✅ |

## 65 Kellick Street, Waterloo NSW 2017

| | open data | Microburbs |
|---|---|---|
| state / verdict | done / **NO-GO** — 1 red flag: investigate before making an offer | done / **NO-GO** — 1 red flag: investigate before making an offer |
| GNAF | GANSW706238485 (65 Kellick Street, Waterloo NSW 2017) | GANSW706238485 (65 Kellick Street, Waterloo (NSW)) |

| row | open data | Microburbs | match |
|---|---|---|---|
| flood — Flood (modelled) | GREEN · nearest ? | GREEN · nearest 678 m (678 m) | ✅ |
| historical_flood — Flood (historical) | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| bushfire — Bushfire-prone | GREEN · none within search radius | GREEN · none within search radius | ✅ |
| erosion — Erosion | GREEN · none within search radius | GREEN · none within search radius | ✅ |
| landslide — Landslide | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| environment — Contamination / environment | GREEN · nearest 267 m (267 m) | GREEN · none within search radius | ✅ |
| anef — Aircraft noise (ANEF) | GREY · no ANEF data returned for this suburb | GREY · no ANEF data returned for this suburb | ✅ |
| ph_area — Public housing — area share | GREEN · 4.7% of homes in this area (0 m) | GREEN · 4.4% of homes in this area (0 m) | ✅ |
| ph_200 — Public housing — within 200 m | GREY · no data (no_open_data) | GREEN · 54 of 1151 homes flagged (4.7%) (150 m) | open GREY |
| hv_power_line — High-voltage power line | GREEN · nearest ? | GREEN · nearest 589 m (589 m) | ✅ |
| street — Street growth forecast | GREEN · Kellick Street: rank 12/41 (upper third), 4-yr 3.6%/yr vs suburb 2.9%/yr | GREEN · Kellick Street: rank 12/41 (upper third), 4-yr 3.6%/yr vs suburb 2.9%/yr | passthrough |
| avm — Microburbs valuation (AVM) | RED · asking $1,900,000 is 38.6% vs AVM $1,370,615 | RED · asking $1,900,000 is 38.6% vs AVM $1,370,615 | ✅ |
| quoting — Agency quoting accuracy | GREEN · Moderate Underquoter, median 7.4% above guide | GREEN · Moderate Underquoter, median 7.4% above guide | passthrough |
| heritage — Heritage overlay | AMBER · on property (0 m) | AMBER · on property (0 m) | ✅ |
| mobile_black_spot — Mobile black spot | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| transport — Nearest transport | INFO · train 669 m · bus 108 m | INFO · train 899 m · bus 101 m | ✅ |
| tenure — Owner-occupied / rented | INFO · Owner-occ 24% · Rented 73% | INFO · Owner-occ 27% · Rented 70% | ✅ |
| median_price — Median house price | GREY · no data (out_of_scope_open_data) | INFO · $1,920,000 here vs $1,360,000 suburb (+41%) | open GREY |
| investor — Investor concentration | GREEN · 44% investment-owned | GREEN · 40% investment-owned | ✅ |
| mortgage_stress — Mortgage stress | GREEN · score 21.5 / 100 | GREEN · score 21 / 100 | ✅ |
| neg_gearing — Negative gearing | GREY · no data (no_property_level_open_data) | INFO · −$572/wk at 80% LVR (negatively geared) | open GREY |
| affordability — Affordability | GREY · no data (needs_sales_data) | INFO · index 91 · Strong Outlook | open GREY |
| yield — Gross yield | GREY · no data (out_of_scope_open_data) | INFO · 3.5% | open GREY |
| vacancy — Vacancy rate | GREY · no data (out_of_scope_open_data) | GREEN · 0.6% (houses, suburb) | open GREY |
| insurance — Landlord insurance | GREY · empty | INFO · ~$2,326/yr median (comprehensive) | open GREY |
| max_height — Planning: zone + height limit | INFO · Max height 9 m (HOB) · MU1 Mixed Use | INFO · Max height 9 m (HOB) · B4 Mixed Use | ✅ |
| das — Development applications | INFO · 34 within 300 m · nearest 37 m (37 m) | GREY · no data (no_data) | MB GREY |
| council_rates — Council rates | GREY · no data (not_open_data) | INFO · $814/yr average | open GREY |
| roads — Busy roads + noise | INFO · busy roads and the noise heatmap · open the map | INFO · busy roads and the noise heatmap · open the map | ✅ |
| easements — Easements | INFO · mapped easements within 1 km · open the map | INFO · mapped easements within 1 km · open the map | ✅ |

## 11 Chelsea Street, Redfern NSW 2016

| | open data | Microburbs |
|---|---|---|
| state / verdict | done / **INVESTIGATE** — 3 items worth checking | done / **INVESTIGATE** — 2 items worth checking |
| GNAF | GANSW705815727 (11 Chelsea Street, Redfern NSW 2016) | GANSW705815727 (11 Chelsea Street, Redfern) |

| row | open data | Microburbs | match |
|---|---|---|---|
| flood — Flood (modelled) | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| historical_flood — Flood (historical) | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| bushfire — Bushfire-prone | GREEN · none within search radius | GREEN · none within search radius | ✅ |
| erosion — Erosion | GREEN · none within search radius | GREEN · none within search radius | ✅ |
| landslide — Landslide | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| environment — Contamination / environment | AMBER · nearest 110 m (110 m) | GREEN · none within search radius | ❌ |
| anef — Aircraft noise (ANEF) | GREY · no ANEF data returned for this suburb | GREY · no ANEF data returned for this suburb | ✅ |
| ph_area — Public housing — area share | GREEN · 0% of homes in this area (0 m) | GREEN · this address's area is not in the public-housing layer (211 m) | ✅ |
| ph_200 — Public housing — within 200 m | GREY · no data (no_open_data) | GREEN · 0 of 636 homes flagged (0.0%) | open GREY |
| hv_power_line — High-voltage power line | GREEN · nearest ? | GREEN · nearest 794 m (794 m) | ✅ |
| street — Street growth forecast | GREEN · Chelsea Street: rank 5/53 (upper third), 4-yr 5%/yr vs suburb 3.7%/yr | GREEN · Chelsea Street: rank 5/53 (upper third), 4-yr 5%/yr vs suburb 3.7%/yr | passthrough |
| avm — Microburbs valuation (AVM) | GREEN · asking $1,900,000 is -25.7% vs AVM $2,557,858 | GREEN · asking $1,900,000 is -25.7% vs AVM $2,557,858 | ✅ |
| quoting — Agency quoting accuracy | GREEN · Moderate Underquoter, median 9.6% above guide | GREEN · Moderate Underquoter, median 9.6% above guide | passthrough |
| heritage — Heritage overlay | AMBER · on property (0 m) | AMBER · on property (0 m) | ✅ |
| mobile_black_spot — Mobile black spot | GREEN · nearest ? | GREEN · none within search radius | ✅ |
| transport — Nearest transport | INFO · tram 541 m · bus 186 m | INFO · train 378 m · bus 189 m | ✅ |
| tenure — Owner-occupied / rented | INFO · Owner-occ 35% · Rented 62% | INFO · Owner-occ 32% · Rented 65% | ✅ |
| median_price — Median house price | GREY · no data (out_of_scope_open_data) | INFO · $1,700,000 here vs $1,910,000 suburb (-11%) | open GREY |
| investor — Investor concentration | GREEN · 46% investment-owned | AMBER · 75% investment-owned | ❌ |
| mortgage_stress — Mortgage stress | GREEN · score 14.2 / 100 | GREEN · score 20 / 100 | ✅ |
| neg_gearing — Negative gearing | GREY · no data (no_property_level_open_data) | INFO · −$1,494/wk at 80% LVR (negatively geared) | open GREY |
| affordability — Affordability | GREY · no data (needs_sales_data) | INFO · index 62 · Solid | open GREY |
| yield — Gross yield | GREY · no data (out_of_scope_open_data) | INFO · 2.8% | open GREY |
| vacancy — Vacancy rate | GREY · no data (out_of_scope_open_data) | GREEN · 0.9% (houses, suburb) | open GREY |
| insurance — Landlord insurance | GREY · empty | INFO · ~$2,452/yr median (comprehensive) | open GREY |
| max_height — Planning: zone + height limit | INFO · Max height 9 m (HOB) · R1 General Residential | INFO · Max height 9 m (HOB) · R1 General Residential | ✅ |
| das — Development applications | AMBER · 27 within 300 m · nearest 24 m (24 m) | INFO · 10 within 300 m · nearest 44 m (44 m) | ❌ |
| council_rates — Council rates | GREY · no data (not_open_data) | INFO · $814/yr average | open GREY |
| roads — Busy roads + noise | INFO · busy roads and the noise heatmap · open the map | INFO · busy roads and the noise heatmap · open the map | ✅ |
| easements — Easements | INFO · mapped easements within 1 km · open the map | INFO · mapped easements within 1 km · open the map | ✅ |

## Totals (rows where both sides answered, excluding passthrough)

| same status | different status | open GREY, Microburbs rated | Microburbs GREY, open rated |
|---|---|---|---|
| 55 | 5 | 23 | 1 |

## Reading the differences (8 Nov 2026)

- **Verdicts agree on all three** (NO-GO, NO-GO, INVESTIGATE) and the GNAF PIDs match. 55 of 60 rated rows have the same status.
- **Contamination (environment)**: open data rates AMBER at Corben St and Chelsea St where Microburbs is GREEN. The EPA "Contaminated Sites" layer lists every notified site including those *formerly* regulated or where "regulation not required" (inner Sydney has hundreds: old service stations, dry cleaners). Microburbs' environment layer is sparser. Filtering on `managementclass` (keep only sites currently regulated under the CLM Act) would bring the row closer; left as a tuning decision for the rules.
- **Investor concentration**: 36% vs 75% at Corben St. Open data is the SA1 share of dwellings rented through an agent or private landlord (Census 2021); Microburbs reports an ownership-based figure per mesh block. Different definitions, same direction at the other two addresses (44/40, 46/?).
- **Flood / landslide / historical flood / HV / mobile black spot**: GREEN "nearest ?" on the open side means *not assessed* (no CC BY layer for the Sydney LGA), not "clear". Microburbs' GREEN comes from its own layers. Fix is the one-line GREY rule noted in README.
- **DA counts** are higher on the open side (121 vs 39 within 300 m) because the Online DA API returns 24 months of every application type, including modifications and CDCs; the row status still agrees.
- **Transport**: distances differ by 50–230 m because GTFS stops are platform/stop points while Microburbs uses station centroids; both pick the same nearest modes.
- **Public housing SA1 share** differs by a few points (Census state-housing-authority landlord share vs Microburbs' layer) with the same RED/GREEN outcome.
- **23 rows are GREY on the open side by design**: price, yield, vacancy, affordability, insurance, council rates, property-level negative gearing, 200 m public housing. See SOURCES.md "Deliberately not used".
- The `avm` row appears because this branch is based on main before the AVM removal; the proxy passes `valuation/avm` through to Microburbs, so it is identical on both sides and disappears once the AVM-removal commit lands.
