# Team MOGL: Microburbs hackathon submission (7 Nov 2026)

**Team:** MOGL (Jake Milne, Sydney buyer's agency). **Entering:** Task 1 (social post) and Task 3 (Chrome extension).

## What we built
| Task | Deliverable | Where |
|---|---|---|
| Task 1 | Reel: **"Waterloo: 749 public homes out, 3,000 in"** (43.5 s, Hand & Machine documentary cut: 9News footage, two real soundbites, the recreated ABC page, five Microburbs map shots), with a pitch video (44.6 s) | [`/demo.mp4`](demo.mp4), [`/pitch.mp4`](pitch.mp4) |
| Task 1 | Second post: **"Zetland: Same developer, two councils"** (43.4 s, Hand & Machine cut: 9News footage of Harry Triguboff, his own soundbite, six Microburbs map shots) | [`/task1a/demo.mp4`](task1a/demo.mp4) |
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
- Map drawer, on click only: `GET /v1/properties/{gnaf}/risks/all?geojson=true`; `GET /v1/suburbs/{SAL}/shapes/hazards`, `/shapes/public-housing-sa1`, `/shapes/noise-heatmap`, `/shapes/busy-roads`, `/shapes/easements` (all `?geojson=true`), `/development/zoning-map`, `/development/building-controls`
- `GET /v1/suburbs/{SAL}/listings/for-sale`, `/properties`, `/demographics/tenure` (demo listing pick, held-out check and reels)

Also:
- The Zetland reel uses **Microburbs' national API** for Little Bay (outside the hackathon area), licensed to MOGL.
- Maps: **OpenFreeMap** tiles, **OpenStreetMap** data (© OpenStreetMap contributors, ODbL), **OpenMapTiles** schema. Terrain: **Geoscience Australia**.
- On-screen claims: **ABC News**, **NSW Planning Portal**, **The Urban Developer** (each figure listed below).
- The extension reads only the listing address from the page. The asking price is typed in by the user.

The repo holds no API keys, no API output and no supplied CSV rows. `fixtures/synthetic/` is hand-written JSON shaped like the OpenAPI examples, with invented values.

## Sources for every figure

### Reel 1B — Waterloo (demo.mp4)
- 749 public homes out; about 3,000–3,300 homes in: ABC News, 25 May 2026 (https://www.abc.net.au/news/2026-05-25/waterloo-public-housing-estate-fenced-off-ahead-of-demolition/106718016); NSW Planning Waterloo South page; Major Projects listing SSD-93222706.
- First block of ~150 homes fenced, May 2026: ABC News, 25 May 2026 (as above).
- Protest camp cleared in June 2026, one arrest: ABC News, 19 Jun 2026 (https://www.abc.net.au/news/2026-06-19/arrest-police-clear-waterloo-public-housing-demolition-protest/106817688).
- About 50% private, 20% affordable, 30% social delivered by community housing providers: ABC News, 25 May 2026.
- Rose Jackson, "not functional communities": ABC News, 25 May 2026 (said of large old estates in general).
- +150 to +250 net social homes: our arithmetic, 30% × 3,000–3,300 − 749.
- Height controls in force since 28 Feb 2023 (Sydney LEP 2012); concept SSDA decision due late 2026: NSW Planning Portal, Waterloo Estate (South) finalisation (https://www.planningportal.nsw.gov.au/ppr/finalisation/waterloo-estate-south).
- 20.2% public housing, 69.5% renting, 27.4% owner-occupied (2021 Census): Microburbs API, /v1/suburbs/Waterloo (NSW)/demographics/tenure.
- Public-housing share by SA1, 1.6%–82.7%, 9 of 14 SA1s above 50% (2021 Census): Microburbs API, shapes/public-housing-sa1.
- Renters by mesh block, 53.9%–84.6% across 84 mesh blocks: Microburbs API, demographics/tenure (per-microburb renting_pct) joined to shapes/mesh-blocks.
- Map layers: development/zoning-map; development/building-controls (HOB 3–117 m); development/applications (100 of 149); shapes/boundary.

### Reel 1A — Zetland (task1a/demo.mp4)
- 27-storey tower, 230 + 72 = 302 apartments, 28 townhouses (DA D/2024/816, 905 South Dowling St, lodged 8 Oct 2024): Microburbs API, /v1/suburbs/Zetland/development/applications.
- Former Suttons Holden site, 118–130 Epsom Rd / 905 South Dowling St, Meriton (Harry Triguboff): The Urban Developer (https://www.theurbandeveloper.com/articles/meriton-zetland-epsom-road-masterplan-apartments-nsw).
- Randwick Council unanimous vote asking the City of Sydney to reject the plan, June 2023: ABC News, 8 Jun 2023 (https://www.abc.net.au/news/2023-06-08/nsw-government-tested-by-proposed-meriton-development-zetland/102405572).
- City of Sydney councillors in favour, all but one: Green Street News (https://greenstreetnews.com/?p=598240).
- Up to 90 m on part of the site, FSR unchanged, LEP amended 1 May 2024 (PP-2022-2530): NSW Planning Portal LEP decision (https://www.planningportal.nsw.gov.au/ppr/lep-decision/118-130-epsom-road-and-905-south-dowling-street-zetland-sydney-lep-2012-amendment).
- Zetland height limits (25–45 m at the site) and zoning: Microburbs API, development/building-controls and development/zoning-map.
- Little Bay height limits 8–18 m: Microburbs national API (MOGL's own licensed key), development/building-controls, suburb Little Bay. Shown as "outside the hackathon dataset".
- Little Bay: earlier schemes of ~2,600 apartments in two 27-storey towers rejected, including by the Housing Delivery Authority in 2025; HDA recommended 505 homes at 2–5 storeys on 29 Oct 2026: The Urban Developer (https://www.theurbandeveloper.com/articles/meriton-harry-triguboff-little-bay-sydney-nsw-ssd-approval).
- "I bought my first place here in 2008, Gadigal Avenue": Jake Milne, owner 2008–. Victoria Park history (racecourse 1908–1944, motor racing, later car factory, housing from the 1990s): Dictionary of Sydney (https://dictionaryofsydney.org/node/6299); Wikipedia, Victoria Park Racecourse, Sydney.

### Maps and media
- Vector tiles: OpenFreeMap (https://openfreemap.org), OpenMapTiles schema, data © OpenStreetMap contributors (ODbL).
- Voice: Jake Milne's own cloned ElevenLabs voice.
- Property verdicts in the extension demo: Microburbs hackathon API, live on 7 Nov 2026.

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

## Hand & Machine UI and the map drawer (extension)
**Look.** The panel uses MOGL's "Hand & Machine" system from the doc reels: a near-black ground (#161616) with a faint film grain (an inline SVG `feTurbulence` noise at 7% opacity), Fraunces for the verdict, address and row names, JetBrains Mono for every number, label and the input boxes, and thin hairlines instead of cards. Signal red (#ff3131) is kept for the hand's marks: a hand-drawn circle round the verdict, an underline under each red row's name, and the red pen circle on the map. NO-GO is red, INVESTIGATE amber, GO a muted green. The top bar carries the "MOGL · Microburbs data" lockup. Fonts are bundled in `extension/assets/fonts/` (Fraunces, JetBrains Mono; SIL OFL) and injected as `@font-face` in the page head through `chrome.runtime.getURL`, because a shadow root can't declare font faces; Georgia and `ui-monospace` are the fallbacks. Motion (pen strokes drawing on, the drawer slide, the map orbit) is switched off under `prefers-reduced-motion`.

**Map drawer.** Each row tagged `MAP` is a toggle (its box shows ticked). Ticking one opens a 520 px drawer that slides out of the panel's left edge, the same height as the panel; unticking the last one (or Clear all, ✕, or Esc) shuts it. The drawer is an extension page (`extension/src/drawer/drawer.html`, listed in `web_accessible_resources`) in an iframe, so the listing site's CSP can't block it. It runs MapLibre GL JS from npm (the CSP build, with its worker shipped as a file, because MV3 pages can't start `blob:` workers) on OpenFreeMap vector tiles, styled after the reel renderer's `layers` mode: dark, desaturated, OSM buildings extruded, pitch 55°, a slow orbit until you drag, a legend card top left, and the subject marked with a red hand-drawn circle.

| Row | Layer | Source |
|---|---|---|
| Flood, historical flood, bushfire, heritage, landslide, erosion, contamination | hatched translucent fill, dashed edge | `risks/all?geojson=true` (1 km clip), else `shapes/hazards?layer=` (suburb, trimmed to 1 km) |
| HV power line | card only: Microburbs returns a count and distance but no geometry for this layer | `risks/all` |
| Public housing (area share, within 200 m) | SA1 choropleth + the flagged homes within 200 m as dots | `shapes/public-housing-sa1` + `surroundings/public-housing` |
| Planning: zone + height limit (new info row) | zoning fills by the feature's colour, height-of-building limits as cyan extrusions with a lighter ceiling, a card with the zone, height limit and FSR at the address | `development/zoning-map` + `development/building-controls` |
| Aircraft noise, Busy roads + noise (new info row) | noise heatmap + busy roads with a dark halo | `shapes/noise-heatmap` + `shapes/busy-roads` |
| Easements (new info row) | hatched fill | `shapes/easements` |
| Street growth forecast | the property marker and a rank card (no street geometry in the API) | `street/profile` (already fetched) |

**How layers are fetched.** Only on click. The content script asks the service worker (`MAP` message); the worker calls the proxy, trims suburb layers to about 1 km round the property, and returns GeoJSON plus legend; the content script posts it into the iframe. The key never leaves the proxy. Responses are cached in memory per tab and dropped on the next address, so opening every hazard row costs one `risks/all?geojson=true` call; a full click-through of every row costs 7 calls. Property position comes from `transport/nearby` (`center_lat`/`center_lng`), falling back to the address's own record in `surroundings/public-housing`. Empty layers show "No mapped {layer} within 1 km". `MAP_DRAWER` in `extension/src/lib/config.ts` turns the drawer off. On the map, hover highlights a shape and you can click any shape for its data (SA1 share, mesh-block renters and median price, zone, height limit, DA details, hazard category, flagged-home chance, road class); the card and a red hand-drawn ring stay until you close the card or click empty map. Flagged homes never show an address.

**Several layers: the stack.** Tick two or more rows and the drawer switches to the reel renderer's stack mode: each layer becomes a translucent slab floating at its own height, in a fixed order from the ground up (zoning → public housing → hazards, each its own slab → height-limit envelopes → noise and busy roads → points). The gap between slabs is a sixth of the layers' footprint (clamped to 120–400 m) and the first slab sits one gap up. Height-limit envelopes are extruded from their slab, points become short cylinders, and busy roads become thin ribbons. A new slab rises from the ground (1.2 s, staggered 0.6 s when several arrive together) and an unticked one drops back and fades out. Each slab has a label tab in its colour, a pale guide pillar stands at the data's corner, and a thin red line runs up through every slab from the red circle on the property. The camera eases to pitch 60 and zooms out to fit the whole stack under the legend; the orbit carries on until you drag. The legend lists each ticked row with its own checkbox (untick there to remove it), and a Stack / Flat switch in the drawer header lays everything flat on the ground instead. Adding layers costs no repeat calls: payloads are kept per address in the panel and the worker, and every hazard comes from the one `risks/all?geojson=true` response. Under reduced motion slabs appear in place without rising.

**Checks.** `node scripts/smoke-map.mjs "14 Raglan Street, Waterloo NSW 2017"` builds every row's payload against the proxy and writes them to `out/maps/` (gitignored). The drawer was screenshotted headless with a synthetic flood layer, with live planning and public-housing payloads, and in stack mode with three synthetic layers (zoning, flood, height limits) early and late in the rise.

**Map credits.** Map: © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap · Data: Microburbs (shown on the map). MapLibre GL JS (BSD-3-Clause).

## Panel v3: quiet rows, notes behind "i", more rows
Each row is now one line: a status dot, a hairline icon (thin single-weight strokes, no fills, after the reel's Hairline figures), the name and its one value in JetBrains Mono. Fraunces is kept for the verdict and the address. Everything technical sits behind the row's small **i** button, which opens a note inside the shadow DOM: the endpoint path, the source level and distance, the threshold rule, and caveats (modelled, 2021 Census, microburb estimate, ANEF, "verify on the s10.7 planning certificate"). The map toggle is a small map icon.

New rows (all suburb calls use the exact SAL from the property profile; concurrency 4; data:null shows grey):

| Row | Endpoint | Shown | Rule | Map |
|---|---|---|---|---|
| Owner-occupied / rented | `/suburbs/{SAL}/demographics/tenure` | Owner-occ 27% · Rented 70% (mesh-block row in the note) | info | renters % per mesh block, joined to `/shapes/mesh-blocks` |
| Street forecast chart | `/properties/{gnaf}/street/profile` (already fetched) | 2024–2026 history, 2028 and 2030 targets dashed, suburb median dotted | as before | — |
| Median house/unit price | `/suburbs/{SAL}/market/median-price-map?property_type=` | this mesh block vs the median of the suburb's microburb medians | info | per microburb (mesh block) choropleth; no SA1 price layer exists |
| Investor concentration | `/market/investor-concentration` | mesh block `pct_investment` (suburb fallback) | AMBER ≥60% | — |
| Mortgage stress | `/market/mortgage-stress` | mesh block score 0–100 | RED ≥60 · AMBER 40–60 | — |
| Negative gearing | `/properties/{gnaf}/valuation/negative-gearing` | net cash flow per week at 80% LVR | grey if `rent_estimate_suspect` | — |
| Affordability | `/market/affordability` | index + zone | info | — |
| Gross yield | `/market/yield-pct` | house or unit by the address's dwelling type | AMBER <3% for units | — (`yield-map` returns no data for these suburbs) |
| Vacancy rate | `/market/vacancy-rate` (+ `/market/vacancy-map` mesh block in the note) | house or unit | RED >3% · AMBER 2–3% | — |
| Landlord insurance | `/risks/extras → insurance` (same response the ANEF row reads) | comprehensive median per year | info | — |
| Planning: zone + height limit | `/development/building-controls` + `/zoning-map`, point-in-polygon at the property | Max height 9 m (HOB) · R1 | info | the planning layer (zoning + HOB extrusions) |
| Development applications | `/development/applications` | count within 300 m + nearest (title, stage, date) | AMBER for a demolition / new-dwelling DA within 100 m | DA points |
| Council rates | `/development/council-rates` | average annual rates | info | — |

A full report is now about 23 API calls (was about 10); the zoning, building-controls, tenure, price and DA responses seed the drawer cache, so their maps open with no extra calls.

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
- `node scripts/smoke-map.mjs`: builds every map-drawer payload against the proxy
- `node scripts/holdout-sa1.mjs`, `node scripts/holdout.mjs`: held-out checks (aggregates only)

**Key handling:** the key lives only in `proxy/.env` (gitignored). The proxy binds to 127.0.0.1, allows only the endpoints above (including the drawer's map layers), rate-limits to 8 req/s, honours 429 `Retry-After`, sends `Cache-Control: no-store`, requires the shared `X-Ext-Token` header and rejects any browser `Origin` that isn't `chrome-extension://`. The extension keeps API data in memory per tab only.

## Credits and licences
- Data: **Microburbs** (microburbs.com.au), hackathon API; national API used under MOGL's licence for the Little Bay figures.
- *Incorporates or developed using G-NAF © Geoscape Australia licensed by the Commonwealth of Australia under the Open G-NAF End User Licence Agreement.*
- Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL). Tiles by OpenFreeMap; schema by OpenMapTiles.
- Terrain: © Commonwealth of Australia (Geoscience Australia), CC BY 4.0.
- News and planning sources: ABC News, NSW Planning Portal, The Urban Developer (cited per figure above; quoted only as facts with attribution).
- Fonts: Fraunces and JetBrains Mono, SIL Open Font License. Maps: MapLibre GL JS (BSD-3-Clause).
- Extension address selectors adapted from MOGL's own listing-scraper extension.
- Code: MIT. Decision support and journalism, not financial or legal advice.

### Reel 1B, Hand & Machine cut: footage and article sources

Additions to the figure → source table for `demo.mp4` (H&M version). The Microburbs map figures are unchanged from the flat reel.

#### Footage (news excerpts, fair dealing for reporting news, Copyright Act s103B; each excerpt 6 s or less, credited on screen)

| On screen | What | Source |
|---|---|---|
| 0:00–2.9 s, "NO DEMOLITIONS" march, fencing | 9News report on the Waterloo protest camp, June 2026 | 9News, via "Save Waterloo encampment day 17 prime time news reports", Action for Public Housing (YouTube, uploaded 11 Jun 2026), https://www.youtube.com/watch?v=UCqE4ptlAY4 (excerpt 1:00–1:06) |
| ~4.5–6.6 s, the estate behind the fence | 9News b-roll of the Waterloo South walk-ups and fencing | same video, 1:06–1:12 |
| ~6.6–12.4 s, police at the fence, then soundbite | Collin Cox, Waterloo resident: "We've got to go through whatever these people are going through, we've got to be next." (YouTube auto-captions read "We're going to be next.") | same video, 1:36–1:42 (9News) |
| ~15–21 s, soundbite | Rebecca Pinkstone, Homes NSW (name from the 9News super): "We're transforming 750 homes into 3,300 new homes." | same video, 1:06–1:12 (9News) |
| ~28.6–32.7 s, under the news page | 9News studio open, "Housing standoff" | same video, 0:28–0:34 |

#### Recreated article (text verbatim, layout our own)

| On screen | Source |
|---|---|
| Headline "Housing minister says Waterloo community 'not functional' as demolition looms for public housing estate", Rose Jackson's quote ("...they're not functional communities"), three paragraphs and Julie's line | ABC News, Declan Bowring, 25 May 2026, https://www.abc.net.au/news/2026-05-25/waterloo-public-housing-estate-fenced-off-ahead-of-demolition/106718016 |

#### Figures on new plates

| Figure | Source |
|---|---|
| Fenced 25 May 2026, block of ~150 homes | ABC News, 25 May 2026 (above) |
| Protest camp cleared, June 2026 | ABC News, 19 Jun 2026, https://www.abc.net.au/news/2026-06-19/arrest-police-clear-waterloo-public-housing-demolition-protest/106817688 |
| Waterloo 20.2% public housing; highest SA1 82.7% | Microburbs API, shapes/public-housing-sa1 and demographics/tenure, 2021 Census |
| Renters 69.5% of households | Microburbs API, demographics/tenure, 2021 Census |
| Mix ~50% private / ~20% affordable / ~30% social | ABC News, 25 May 2026 |
| +150 to +250 net new social homes | Arithmetic: 30% × 3,000–3,300 − 749 |
| Height controls in force 28 Feb 2023 | NSW Planning Portal, Waterloo Estate (South) finalisation, https://www.planningportal.nsw.gov.au/ppr/finalisation/waterloo-estate-south |

Maps: Microburbs data · © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap.

### Reel 1A (H&M)

Zetland: Randwick objected. The City backed it. H&M rebuild, 7 Nov 2026. Footage is a news excerpt (fair dealing for reporting news, Copyright Act s103B; each excerpt 6 s or less, credited on screen).

| On screen | What | Source |
|---|---|---|
| 0:00–1.5 s, Harry Triguboff on camera (hook) | 9News exclusive interview with Harry Triguboff (muted under the VO) | 9 News Australia, "Billionaire developer Harry Triguboff exclusive", YouTube, uploaded 19 Feb 2019, https://www.youtube.com/watch?v=QUd36rICiOI (excerpt 0:35.6–0:41.6) |
| ~1.5–3.1 s, Triguboff again; ~8.2–12.6 s, soundbite | Harry Triguboff: "I am building at the same rate. So what I can't sell, I lease." | same video, 1:30.8–1:36.8 (9News) |

#### Figures on new plates (Reel 1A)

| Figure | Source |
|---|---|
| DA D/2024/816: 27 storeys, 302 apartments + 28 townhouses | Microburbs API, development/applications, Zetland |
| Randwick Council unanimous vote, June 2023 | ABC News, 8 Jun 2023, https://www.abc.net.au/news/2023-06-08/nsw-government-tested-by-proposed-meriton-development-zetland/102405572 |
| City of Sydney councillors: all but one in favour | Green Street News, 27 Jun 2023, https://greenstreetnews.com/?p=598240 |
| Up to 90 m on part of the site, LEP amended 1 May 2024, floor space unchanged | NSW Planning Portal, https://www.planningportal.nsw.gov.au/ppr/lep-decision/118-130-epsom-road-and-905-south-dowling-street-zetland-sydney-lep-2012-amendment |
| Little Bay: ~2,600 apartments / 2 × 27 storeys rejected incl. HDA 2025; HDA backs 2-5 storeys 29 Oct 2026 | The Urban Developer, https://www.theurbandeveloper.com/articles/meriton-harry-triguboff-little-bay-sydney-nsw-ssd-approval |

Maps: Microburbs data (Little Bay from Microburbs national data, outside the hackathon dataset) · © OpenStreetMap contributors, OpenFreeMap.
