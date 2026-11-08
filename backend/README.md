# mb-redflags open-data backend (phase 1: NSW, Greater Sydney)

Serves the extension's rows from CC BY open data instead of Microburbs, for everything except the two rows that have no
open equivalent (street growth forecast, agency quoting). PostGIS in Docker, one idempotent ingest script per source,
and a handful of routes added to `proxy/server.mjs` behind `OPEN_DATA=1` that answer the **same paths and JSON envelope**
the extension already parses (`{data}` or `{data: null, available: false, reason}`), so `extension/src` is unchanged.

Why: at Microburbs production prices each property costs about $3.60. The audit on 8 Nov 2026 found 15 of the 23 rows
can come from CC BY data; this is that path. Licences are recorded per source in [`SOURCES.md`](SOURCES.md), the
per-row comparison against Microburbs for three real listings in [`VALIDATION.md`](VALIDATION.md).

## Setup

Prerequisites: Docker Desktop, Node 22, `unzip`, `curl`, ~12 GB disk (G-NAF zip 1.9 GB, GTFS 0.3 GB, PostGIS volume ~6 GB).

```bash
cd backend
make up        # docker compose up -d db  (postgis/postgis:16-3.4 on 127.0.0.1:5433, db/user/password mbrf)
make ingest    # downloads to data/raw/, loads every source for the 33 Greater Sydney LGAs (~1.5 h, mostly G-NAF + DA backfill)
make check     # what is loaded, per source and step
```

Then from the repo root:

```bash
npm run proxy:open     # OPEN_DATA=1 node proxy/server.mjs  (Microburbs key still used for forecast + quoting)
npm run smoke:open     # pipeline + rules against the three validation listings
```

`make ingest` is resumable: every step records itself in `ingest_state`; rerun after a failure and finished steps are
skipped. `make ingest-<source>` runs one source (`gnaf asgs planning hazards da census afford ato bonds gtfs roads easements derived`).
`--force` (via `make refresh-weekly`) re-pulls a source even if marked done.

Data lives in `backend/data/` (gitignored). The repo is public: never commit downloads, API dumps or keys.

### Manual step: rental bonds
`fairtrading.nsw.gov.au` serves the monthly bond workbooks behind a Cloudflare JavaScript challenge, so the script gets an
HTML page instead of the xlsx. Download the last 12 `rentalbond_lodgements_<month>_<year>.xlsx` from
https://www.fairtrading.nsw.gov.au/about-fair-trading/rental-bond-data into `backend/data/raw/bonds/` and run
`make ingest-bonds`. Until then `market/median-rent` answers `available: false, reason: no_bond_files_loaded`.

### Gotcha seen on the Mac mini
`docker pull` can hang forever with no output when Docker Desktop's keychain credential helper
(`docker-credential-desktop`) blocks. Pull once with an empty config: `DOCKER_CONFIG=$(mktemp -d) docker pull postgis/postgis:16-3.4`
(write `{}` to `config.json` in that dir first), then `make up` works with the normal config.

## Refresh cadence

| Cadence | Command | Sources |
|---------|---------|---------|
| Nightly | `make refresh-nightly` | NSW Online DA API (re-pulls the last 14 days by lodgement date; the 24-month backfill runs once) |
| Weekly | `make refresh-weekly` | ePlanning planning + hazard layers, RFS bush fire prone land, mine subsidence, EPA sites, Spatial Services roads + easements, then the derived hulls |
| Quarterly | `make ingest-gnaf --force` after bumping the zip name in `src/ingest/gnaf.mjs` | G-NAF (Geoscape releases Feb/May/Aug/Nov) |
| On release | `make ingest-gtfs --force`, `make ingest-ato --force`, `make ingest-bonds` | GTFS (TfNSW republishes most weeks), ATO table 25 (yearly), bonds (monthly) |
| Never (static) | — | ASGS 2021 allocation, Census 2021, RDH 2021 indicators |

A cron line for the Mac mini: `17 3 * * * cd ~/mb-redflags/backend && make refresh-nightly >> data/logs/cron.log 2>&1` and
`47 3 * * 1 cd ~/mb-redflags/backend && make refresh-weekly >> data/logs/cron.log 2>&1`.

## What the proxy answers with `OPEN_DATA=1`

| Path | Source | Notes |
|------|--------|-------|
| `/v1/geocode/address?address=` | G-NAF (pg_trgm) | returns `id` (GNAF PID), `abbr` ("34 CORBEN ST SURRY HILLS"), `display_name`, `property_type`, lat/lng |
| `/v1/properties/{gnaf}/profile` | G-NAF + ASGS | mesh block, SA1-SA4, GCCSA, SAL (`suburb`), LGA, postcode, lat/lng |
| `/v1/properties/{gnaf}/risks/all[?geojson=true]` | ePlanning, RFS, Spatial Services, EPA, DCCEEW, Census | per layer: `on_property`, `nearest_distance_m`, `features_within_radius` (1 km), `value`, `assessed`, `source`; with `geojson=true` a 1 km clip per layer |
| `/v1/properties/{gnaf}/transport/nearby` | TfNSW GTFS | nearest stop per mode within 1 km, counts within 400 m and 800 m |
| `/v1/properties/{gnaf}/development/applications?radius_m=500` | Online DA API | **new route**, radius query |
| `/v1/properties/{gnaf}/surroundings/public-housing` | — | `available: false` (no address-level open source; SA1 share is in `risks/all.public_housing`) |
| `/v1/properties/{gnaf}/valuation/negative-gearing` | — | `available: false` (needs a price + rent for the property) |
| `/v1/properties/{gnaf}/street/profile`, `valuation/agent-quoting` | Microburbs | passed through unchanged (key in `proxy/.env`) |
| `/v1/suburbs/{SAL}/risks/extras` | ePlanning, Spatial Services, EPA | `per_mb.risks[]` with `anef_med` only where an open ANEF/ANEC map covers the mesh block, `acid_pct`, `mine_pct`, `contam_pct`; no insurance |
| `/v1/suburbs/{SAL}/risks/property-hazard-counts` | same | suburb counts; `aircraft_noise: {}` where no open contours exist (Sydney Airport) |
| `/v1/suburbs/{SAL}/shapes/hazards?layer=`, `busy-roads`, `easements`, `public-housing-sa1`, `mesh-blocks` | as above | GeoJSON clipped to the suburb's address hull; `noise-heatmap` is `available: false` |
| `/v1/suburbs/{SAL}/development/zoning-map`, `building-controls` | ePlanning | `sym_code`/`lay_class`/`color`; `hob.height_m`, `fsr.fsr`, `lot_size` |
| `/v1/suburbs/{SAL}/development/applications` | Online DA API | last 24 months inside the suburb hull |
| `/v1/suburbs/{SAL}/demographics/tenure`, `market/investor-concentration` | Census 2021 G37 (SA1) | mesh blocks inherit their SA1 (`street: "SA1 …"`) |
| `/v1/suburbs/{SAL}/demographics/income` | Census 2021 G02 | **new route**, median household income |
| `/v1/suburbs/{SAL}/market/mortgage-stress` | RDH MAID (SA2) | `score` = % of mortgaged households paying >30% of income (not Microburbs' 0-100 index) |
| `/v1/suburbs/{SAL}/market/negative-gearing` | ATO table 25 | **new route**, postcode-level landlord share and average net rent |
| `/v1/suburbs/{SAL}/market/median-rent` | Fair Trading bonds | **new route**; needs the manual bond download |
| `/v1/suburbs/{SAL}/market/affordability`, `yield-pct`, `vacancy-rate`, `vacancy-map`, `median-price-map`, `development/council-rates` | — | `available: false` with a reason (Valuer General NC-ND, OLG all-rights-reserved, listings not open) |

Suburb geometry: we load no ABS boundary files; a suburb / SA1 / mesh block is the concave hull of its G-NAF address
points (`area_hull`). Good enough for clipping layers and choropleths, not a legal boundary.

## Row-by-row coverage (the extension's 23 rows + map layers)

| Row (rules.ts id) | Open-data status | Source | How it differs from Microburbs |
|---|---|---|---|
| flood | **partial** | ePlanning Flood Planning (LEP) | only Hornsby + two SEPP precincts inside Greater Sydney have an EPI flood layer; elsewhere `assessed: false` (council flood studies are not CC BY) |
| historical_flood | not assessed | — | no CC BY source |
| bushfire | yes | NSW RFS Bush Fire Prone Land | category in `value` |
| erosion | yes | NSW Coastal Erosion 2025 | shapefiles via ogr2ogr |
| landslide | yes (where mapped) | ePlanning Landslide Risk Land | LGA-gated like flood |
| environment | yes | EPA Contaminated Sites | points, ≤30 m counts as on property |
| anef | yes / "no open data" | LEP ANEF + WSA ANEC contours | Sydney Airport ANEF 2045 is PDF-only → GREY with the s10.7 note |
| ph_area | yes | Census 2021 G37 state-housing share at SA1 | SA1 share, not Microburbs' public-housing layer |
| ph_200 | no | — | `available: false` |
| hv_power_line | not assessed | — | phase 2 (GA transmission lines, CC BY 4.0) |
| street | Microburbs | street/profile | passthrough |
| estimate | typed by user | property.com.au | unchanged |
| quoting | Microburbs | agent-quoting | passthrough |
| heritage | yes | ePlanning Heritage | item name + significance |
| mobile_black_spot | not assessed | — | no open source |
| transport | yes | TfNSW GTFS | plus 400 m / 800 m counts |
| tenure | yes | Census G37 | SA1, not mesh block |
| median_price | no | — | Valuer General NC-ND |
| investor | yes | Census G37 (agent + private landlord) | proxy, not ownership records |
| mortgage_stress | yes (different scale) | RDH MAID at SA2 | % in stress, not a 0-100 index |
| neg_gearing | suburb only | ATO table 25 | new suburb route; property row `available: false` |
| affordability | no | — | needs prices |
| yield | no | — | needs prices |
| vacancy | no | — | needs listings |
| insurance | no | — | not open |
| max_height | yes | ePlanning HOB + zoning + FSR | same point-in-polygon in the extension |
| das | yes | Online DA API | plus radius route |
| council_rates | no | — | OLG all-rights-reserved |
| roads (map) | yes | Spatial Services RoadSegment 1-4 | lines; no noise heatmap |
| easements (map + risks/all.easement) | yes | Spatial Services Easement ∩ Lot | lot-based yes/no |

Known rule interaction: `rules.ts` treats a hazard row with `on_property: false` and no distance as GREEN ("nearest ?").
The not-assessed rows above therefore render GREEN with "Not assessed: …" in the detail. A one-line change in
`hazardRow` (status GREY when `assessed === false`) is the follow-up; it was left out to keep `extension/src` untouched.

## Attribution
Show the strings listed at the end of [`SOURCES.md`](SOURCES.md) wherever these rows are displayed; every API answer also
carries a `source`/`sources` field with the matching credit.
