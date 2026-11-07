# Team MOGL: Microburbs hackathon submission (7 Nov 2026)

**Team:** MOGL (Jake Milne, Sydney buyer's agency). **Entering:** Task 1 (social post) and Task 3 (Chrome extension).

## What we built
| Task | Deliverable | Where |
|---|---|---|
| Task 1 | Reel: **"Waterloo: 749 public homes out, 3,000 in"**, with a pitch video | [`/demo.mp4`](demo.mp4), [`/pitch.mp4`](pitch.mp4) |
| Task 1 | Second post: **"Zetland: Randwick objected, the City backed it"** | [`/task1a/demo.mp4`](task1a/demo.mp4) |
| Task 3 | **MB Red Flags**: a GO / INVESTIGATE / NO-GO side panel for City of Sydney listings on realestate.com.au and domain.com.au | [`/extension`](extension), [`/proxy`](proxy) |

Full write-up (data, method, what worked, held-out checks, competitors): [`report.html`](report.html).

## Who it helps
- **Reels:** Sydney residents and buyers who hear "the estate is being redeveloped" but never see the numbers or the map. Each reel names its sources on screen.
- **Extension:** buyers and buyer's agents doing a first pass on a listing before they pay for a building report or a solicitor. It tells you what to check, not what to buy.

## Data used
**Microburbs hackathon API** (`api-ht.microburbs.com.au`, City of Sydney LGA, 29 suburbs):
- `GET /v1/geocode/address`
- `GET /v1/properties/{gnaf}/profile`, `/risks/all`, `/surroundings/public-housing`, `/street/profile`, `/valuation/avm`, `/valuation/agent-quoting`, `/transport/nearby`
- `GET /v1/suburbs/{SAL}/risks/extras`, `/risks/property-hazard-counts`
- `GET /v1/suburbs/{SAL}/listings/for-sale`, `/properties`, `/demographics/tenure` (demo listing pick, held-out check and reels)

Also:
- The Zetland reel uses **Microburbs' national API** for Little Bay (outside the hackathon area), licensed to MOGL.
- Maps: **OpenFreeMap** tiles, **OpenStreetMap** data (© OpenStreetMap contributors, ODbL), **OpenMapTiles** schema. Terrain: **Geoscience Australia**.
- On-screen claims: **ABC News**, **NSW Planning Portal**, **The Urban Developer** (each figure listed below).
- The extension reads only the listing address from the page. The asking price is typed in by the user.

The repo holds no API keys, no API output and no supplied CSV rows. `fixtures/synthetic/` is hand-written JSON shaped like the OpenAPI examples, with invented values.

## Sources for every figure
<!-- Filled from the reel agents' claim lists. One line per on-screen figure: figure, where it appears, source, URL, date accessed. -->
- [ ] Waterloo reel: 749 public homes … (source: ABC News, URL TBC)
- [ ] Waterloo reel: ~3,000 / 3,300 new homes … (source TBC)
- [ ] Waterloo reel: public-housing share (Microburbs `demographics/tenure`, 2021 Census)
- [ ] Zetland reel: Randwick Council objection … (source TBC)
- [ ] Zetland reel: City of Sydney support … (source TBC)
- [ ] Zetland reel: Little Bay figures (Microburbs national API, licensed to MOGL)
- [ ] _add remaining figures_

## The key step
**Task 1 (reels):** every number on screen is tied to a named source, and the "before" is drawn from the API rather than asserted: the public-housing layer and the suburb tenure share put the estate on the map before the script says what is planned. The 749 / 3,300 figures were cross-checked against the ABC article and against the API's tenure share for Waterloo.

**Task 3 (extension):** turning layers that mostly say "somewhere within 1 km" into one honest verdict with the level of every fact labelled:
1. **Address → G-NAF.** Geocode candidates are scored on street number + street name in `abbr`, with a unit bonus (`UNIT 3/12 SMITH ST`) and a suburb bonus; a house address is kept off unit records in the same block.
2. **On-property vs distance.** For each `risks/all` layer: the on-property row first, else the nearest, with a buffer per hazard.
3. **Public housing at two scales.** The SA1 share of the area the address is in (the layer lists only areas with public housing, often up to 20 of them) and the 200 m flagged share from `surroundings/public-housing`; red if the address itself is flagged. The row also shows the nearest area at or above 20%.
4. **Aircraft noise.** `profile.mesh_block` joined to `risks/extras.per_mb.risks[].anef_med`, falling back to `property-hazard-counts.aircraft_noise`. In live testing neither returned ANEF values for the suburbs we tried, so the row shows grey ("no ANEF data") rather than a false green.
5. **Street forecast, AVM, quoting.** Street tercile vs the suburb's 4-year forecast; asking price vs AVM; agency quoting cohort. (`agent-quoting` is free on the hackathon host; on the production API it is billed per call.)

Any RED → **NO-GO** (investigate before making an offer), any AMBER → **INVESTIGATE**, otherwise **GO**. Every row shows its level (property / 200 m / mesh block / SA1 / street / suburb / agency) and distance, and hazard rows remind you to check the s10.7 planning certificate.

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
(Street forecast: middle third is shown neutral, not rated. ANEF with no data is grey.)

### Held-out check (extension)
`node scripts/holdout-sa1.mjs` (no CSVs needed) compares the extension's SA1 public-housing flag with the 2021 Census mesh-block share (`demographics/tenure`) and the 200 m flagged share for 10 addresses in each of 5 suburbs. It writes aggregate counts, precision, recall and correlation only to `out/holdout.json` (gitignored). Results are in `report.html`. With the supplied CSVs, `node scripts/holdout.mjs <public-housing.csv> <addresses.csv>` runs the CSV-based check.

## How to run (extension)
```bash
npm install
npm run build                       # -> extension/dist
cp proxy/.env.example proxy/.env    # put the key on the MB_KEY= line (never commit it)
npm run proxy                       # LIVE, 127.0.0.1:8787
# or, with no key:
npm run proxy:mock                  # serves fixtures/synthetic/*.json; the panel shows a MOCK DATA badge
```
Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → choose `extension/dist`. Open a City of Sydney listing on realestate.com.au or domain.com.au, or type an address into the panel's manual box. Type the asking price to compare it with the AVM.

Other scripts:
- `npm run dev`: mock proxy + rebuild on change
- `npm run typecheck`
- `node scripts/smoke.mjs`: built-in cases (mock). `node scripts/smoke.mjs "34 Corben Street, Surry Hills NSW 2010|1550000"`: live, prints every row with level and distance
- `node scripts/holdout-sa1.mjs`, `node scripts/holdout.mjs`: held-out checks (aggregates only)

**Key handling:** the key lives only in `proxy/.env` (gitignored). The proxy binds to 127.0.0.1, allows only the endpoints above, rate-limits to 8 req/s, honours 429 `Retry-After`, sends `Cache-Control: no-store`, requires the shared `X-Ext-Token` header and rejects any browser `Origin` that isn't `chrome-extension://`. The extension keeps API data in memory per tab only.

## Credits and licences
- Data: **Microburbs** (microburbs.com.au), hackathon API; national API used under MOGL's licence for the Little Bay figures.
- *Incorporates or developed using G-NAF © Geoscape Australia licensed by the Commonwealth of Australia under the Open G-NAF End User Licence Agreement.*
- Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL). Tiles by OpenFreeMap; schema by OpenMapTiles.
- Terrain: © Commonwealth of Australia (Geoscience Australia), CC BY 4.0.
- News and planning sources: ABC News, NSW Planning Portal, The Urban Developer (cited per figure above; quoted only as facts with attribution).
- Extension address selectors adapted from MOGL's own listing-scraper extension.
- Code: MIT. Decision support and journalism, not financial or legal advice.
