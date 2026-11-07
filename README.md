# MB Red Flags: a GO / INVESTIGATE / NO-GO panel for Sydney listings

**What:** a Chrome extension. When you open a realestate.com.au or domain.com.au listing in the City of Sydney, a side panel shows one verdict (**GO / INVESTIGATE / NO-GO**) and the red flags behind it: flood, bushfire, erosion, landslide, contamination, HV power lines, aircraft noise (ANEF), public housing nearby, the street's growth-forecast rank, asking price against the AVM, and how accurately the agency quotes. Every row expands to show the endpoint, the level the fact applies at (property / 200 m / mesh block / SA1 / street / suburb), the distance, and a reminder to check the s10.7 planning certificate.

**Who:** buyers and buyer's agents doing a first pass on a listing before they spend money on a building report or a solicitor. Built by Jake Milne (MOGL, a Sydney buyer's agency) for the Microburbs hackathon, 7 Nov 2026.

**Decision support, not advice.** The wording is kept neutral. The panel tells you what to check, not what to buy.

## Data used
- **Microburbs API** (`api-ht.microburbs.com.au`, City of Sydney LGA, 29 suburbs). Endpoints:
  - `geocode/address` → G-NAF id (picked by matching street number + street name in `abbr`; units are tried as `3/12 Smith St`, then `Unit 3 12 Smith St`)
  - `properties/{gnaf}/profile` (mesh block, SA1), `risks/all`, `surroundings/public-housing`, `street/profile`, `valuation/avm`, `valuation/agent-quoting`, `transport/nearby`
  - `suburbs/{SAL}/risks/extras` (per-mesh-block `anef_med`), with `suburbs/{SAL}/risks/property-hazard-counts` (`aircraft_noise`) as the fallback
- **From the page, only the listing address** (JSON-LD first, then DOM selectors). The extension never reads listing text, photos or price. You type the asking price yourself.
- The repo contains no API keys, no supplied CSVs and no API output. `fixtures/synthetic/` is hand-written JSON shaped like the OpenAPI examples. The values are invented and say nothing about the real addresses.

## The key step
Microburbs has no property-level aircraft-noise endpoint, and most hazard layers come back as "somewhere within 1 km". We do four things to turn that into one honest verdict:
1. **Mesh-block ANEF join.** `profile.mesh_block` → `risks/extras.per_mb.risks[].anef_med`. That gives an aircraft-noise estimate for the listing's own microburb, not its suburb. It is labelled *"microburb estimate, not a property contour"*. If the mesh block is missing, we fall back to the suburb's share of properties in an ANEF area and label it suburb-level.
2. **On-property vs distance.** For each `risks/all` layer, we read the row with `on_property=true` first, then the nearest distance, and apply a hazard-specific buffer (flood 100 m, erosion 200 m, contamination 250 m, HV line 50/200 m). We parse defensively: `public_housing` returns two rows, one on-property and one nearby.
3. **Public housing at two scales.** The area share comes from the on-property row in `risks/all`. The 200 m share is `flagged_count / property_count` from `surroundings/public-housing`. If the subject address itself is flagged, the row goes red. The haversine distance to the nearest flagged home comes from the `transport/nearby` centre point.
4. **Street forecast rank.** `street/profile` tercile plus the 4-year forecast against the suburb median. Rows with thin evidence (fewer than 10 sales, or Low confidence) are greyed out rather than rated.

Then it reduces to a single headline: any RED → **NO-GO** (investigate before making an offer), any AMBER → **INVESTIGATE**, otherwise **GO**.

### Thresholds
| Fact | RED | AMBER |
|---|---|---|
| Flood / historical flood | on property | ≤100 m |
| Bushfire | on property | ≤100 m |
| Erosion | on property | ≤200 m |
| Landslide | on property | ≤100 m |
| Contamination (environment) | on property | ≤250 m |
| HV power line | ≤50 m | ≤200 m |
| Heritage | — | on property |
| Mobile black spot | — | on property |
| Public housing, area share | ≥20% | ≥10% |
| Public housing, 200 m share | ≥15%, or the subject itself is flagged | ≥5% |
| ANEF (mesh block) | ≥25 | 20–25 (null = no mapped exposure) |
| Street forecast | lower third, or ≥2 pts below suburb 4-yr | (GREEN = upper third, above suburb, confidence ≥ Medium; GREY if n_sales < 10 or Low confidence) |
| Asking ÷ AVM | >1.10 | 1.03–1.10 |
| Agent quoting | "Severe Underquoter" or median deviation ≥10% (shows likely sale price) | — |

## How to run
```bash
npm install
npm run build                 # -> extension/dist
cp proxy/.env.example proxy/.env   # then paste the key on the MB_KEY= line
npm run proxy                 # live, 127.0.0.1:8787
# or, with no key:
npm run proxy:mock            # serves fixtures/synthetic/*.json
```
Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → choose `extension/dist`.
Open a listing in Waterloo or Surry Hills (or use the manual address box in the panel).

**Key handling:** the key is kept only in `proxy/.env`, which is gitignored. The proxy binds to 127.0.0.1, allows only the endpoints listed above, rate-limits to 8 req/s with a token bucket, sends `Cache-Control: no-store`, requires the shared `X-Ext-Token` header and rejects any browser `Origin` that isn't `chrome-extension://`. The extension keeps API data in an in-memory per-tab `Map` only, never in `chrome.storage`.

Other scripts: `npm run dev` (mock proxy + tsup watch), `node scripts/smoke.mjs` (runs the real pipeline against the proxy), `node scripts/holdout.mjs <public-housing.csv> <addresses.csv>` (held-out check; writes aggregate precision/recall only, to `out/`).

## Credits
- Data: **Microburbs** (microburbs.com.au), hackathon API.
- Address matching uses G-NAF. *Incorporates or developed using G-NAF © Geoscape Australia licensed by the Commonwealth of Australia under the Open G-NAF End User Licence Agreement.*
- The address selectors are adapted from MOGL's own listing-scraper extension.
