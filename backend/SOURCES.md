# Open data sources (phase 1, NSW / Greater Sydney)

Every source below was checked on 8 Nov 2026 by reading its licence record (CKAN `license_title`, the ArcGIS item
`licenseInfo`, or the publisher's licence page) before the ingest script was written. Nothing here is Microburbs data and
nothing under `backend/data/` is committed. Microburbs' licence forbids caching its responses; CC BY data has no such
limit, so the open-data path stores everything locally and refreshes on the cadence in `README.md`.

| # | Dataset | Publisher | Licence (as verified) | Where verified | Used for | Ingest |
|---|---------|-----------|------------------------|----------------|----------|--------|
| 1 | Geocoded National Address File (G-NAF), Aug 2026, GDA2020 PSV | Geoscape Australia via data.gov.au | CC BY 4.0 + *Open G-NAF End User Licence* (no use for direct marketing; keep the attribution) | `data.gov.au/data/api/3/action/package_show?id=geocoded-national-address-file-g-naf` → `license_title` "Creative Commons Attribution 4.0 International"; EULA PDF resource `20160226-eula-open-g-naf.pdf` | `/v1/geocode/address`, `/v1/properties/{gnaf}/profile`, every point query | `src/ingest/gnaf.mjs` (NSW files only) |
| 2 | ASGS Edition 3 allocation files: `MB_2021_AUST.xlsx`, `SAL_2021_AUST.xlsx`, `LGA_2025_AUST.xlsx` | ABS | CC BY 4.0 (ABS site-wide licence, abs.gov.au/website-privacy-copyright-and-disclaimer) | ABS copyright page: "Creative Commons Attribution 4.0 International licence" | mesh block → SA1/SA2/SA3/SA4/GCCSA/SAL/LGA in `profile`, suburb membership | `src/ingest/asgs.mjs` |
| 3 | Census 2021 General Community Profile DataPack, SA1, NSW (G37 tenure & landlord type, G02 medians) | ABS | CC BY 4.0 | same ABS licence; DataPack zip `2021_GCP_SA1_for_NSW_short-header.zip` | public-housing SA1 share, tenure, investor proxy, median household income | `src/ingest/census.mjs` |
| 4 | EPI Primary Planning Layers: Land Zoning (2), Height of Building (5), Floor Space Ratio (1), Lot Size (4), Heritage (0) | NSW DPHI ePlanning, `mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/EPI_Primary_Planning_Layers/MapServer` | CC BY 4.0 | SEED records `environment-planning-instrument-local-environmental-plan-land-zoning`, `environmental-planning-instrument-height-of-buildings-hob`, `environmental-planning-instrument-heritage-her` → "Creative Commons Attribution 4.0" | zoning-map, building-controls, heritage flag | `src/ingest/planning.mjs` (33 LGAs by `LGA_NAME`) |
| 5 | EPI Hazard: Flood Planning (1), Landslide Risk Land (2) | NSW DPHI ePlanning `Planning/Hazard/MapServer` | CC BY 4.0 | SEED `epi-flood`, `epi-landslide-risk` | flood / landslide rows. **Coverage gap:** inside Greater Sydney the LEP flood planning layer exists only for Hornsby plus the two SEPP precinct maps; other councils keep flood studies outside the EPI dataset (NSW Flood Data Portal, agency licences). The API marks those addresses `assessed: false`. | `src/ingest/hazards.mjs` |
| 6 | EPI Protection: Acid Sulfate Soils (1), Airport Noise / LEP ANEF (2) | NSW DPHI ePlanning `Planning/Protection/MapServer` | CC BY 4.0 | SEED `epi-acid-sulfate-soils`, `epi-protection-airport-noise` | acid sulfate class, ANEF where a council LEP carries contours (Liverpool, Bankstown, Camden, Upper Hunter …) | `src/ingest/hazards.mjs` |
| 7 | SEPP (Precincts—Western Parkland City) 2021, layer 26 Airport Noise = Western Sydney Airport ANEC contours | NSW DPHI ePlanning | CC BY 4.0 (same ePlanning dataset family) | layer metadata `MAP_NAME = "SEPP (Western Sydney Aerotropolis) 2020 Noise Exposure Contour Map"`, `LAY_NAME = "Australian Noise Exposure Concept (units)"` | ANEC for the Aerotropolis | `src/ingest/hazards.mjs` |
| 8 | NSW Bush Fire Prone Land (hosted feature service) | NSW Rural Fire Service via DCS Spatial Services | "CC by NSW RFS — with attribution *NSW Rural Fire Service 2025*" | Spatial Services item `c6fdac015da349e195b0330778a64945` `licenseInfo`; SEED `bush-fire-prone-land` → CC BY 4.0 | bushfire row | `src/ingest/hazards.mjs` (Greater Sydney envelope) |
| 9 | Mines Subsidence District (NSW Administrative Boundaries Theme, layer 7) | DCS Spatial Services | CC BY 4.0, attribution "© Spatial Services" | Spatial Services licence text on the theme items: "Spatial Services has applied the Creative Commons Attribution 4.0 Australia Licence … attributed … © Spatial Services" | mine subsidence row + hazard counts | `src/ingest/hazards.mjs` |
| 10 | EPA Contaminated Sites (notified sites, points) | NSW EPA via `portal.data.nsw.gov.au/arcgis/rest/services/Hosted/Contaminated_Sites/FeatureServer/0` | CC BY (data.nsw.gov.au record *Contaminated Land – Record of Notices*, `license_url` opendefinition CC BY) | `data.nsw.gov.au/data/api/3/action/package_show?id=contaminated-land-record-of-notices-iar` | contamination / environment row (nearest distance, ≤30 m = on property) | `src/ingest/hazards.mjs` |
| 11 | NSW Coastal Erosion – 2025 (Open Coast Beaches, Bay and Estuary Beaches shapefiles) | NSW DCCEEW via SEED | CC BY 4.0 | SEED `nsw-regional-coastal-erosion-hazard-and-shoreline-2025` | erosion row | `src/ingest/hazards.mjs` (ogr2ogr in the `gdal` compose service) |
| 12 | Online DA Data API | NSW Planning Portal, `api.apps1.nsw.gov.au/eplanning/data/v0/OnlineDA` | CC BY | planningportal.nsw.gov.au/opendata/dataset/online-da-data-api ("Creative Commons Attribution") | development applications (suburb list + radius query) | `src/ingest/da.mjs` (24-month backfill, nightly last-14-days) |
| 13 | Census Mortgage and Rent Affordability Indicators for LGAs and SA2s (MAID/RAID × HIED, 2021) | Regional Data Hub, DITRDCA | CC BY | `catalogue.data.infrastructure.gov.au/api/3/action/package_show?id=rdh-census-housing-affordability-data-for-lgas-and-sa2s-mortgage-and-rent-affordability-indicators` | mortgage-stress (share of mortgaged households paying >30% of income) | `src/ingest/afford.mjs` |
| 14 | Taxation Statistics 2023-24, Individuals Table 25 (selected items by postcode) | ATO via data.gov.au | CC BY 2.5 AU | `package_show?id=taxation-statistics-2023-24` → "Creative Commons Attribution 2.5 Australia" | negative gearing (postcode landlords, average net rent) | `src/ingest/ato.mjs` |
| 15 | Rental Bond Lodgement (monthly xlsx) | NSW Fair Trading | CC BY (data.nsw.gov.au record `rental-bond-lodgement`) | `data.nsw.gov.au/data/api/3/action/package_search?q=rental+bond+lodgement` | median asking rent by postcode. **Manual download:** fairtrading.nsw.gov.au serves the files behind a Cloudflare JavaScript challenge, so scripts get an HTML page; save the xlsx files into `data/raw/bonds/` by hand. | `src/ingest/bonds.mjs` |
| 16 | Public Transport – Timetables – Complete – GTFS (static zip) | Transport for NSW Open Data Hub | CC BY 4.0 ("Creative Commons Attribution" on the dataset record) | `opendata.transport.nsw.gov.au/data/api/3/action/package_show?id=timetables-complete-gtfs`; the static zip downloads without an API key (HTTP 206 on a range request) | stops within 400 / 800 m, nearest per mode | `src/ingest/gtfs.mjs` |
| 17 | NSW Transport Theme – RoadSegment (functionhierarchy 1–4) | DCS Spatial Services | CC BY 4.0, "© Spatial Services" | item `050490baf3ea4795b9d5406d7a9e4a48` `licenseInfo` | busy roads (nearest distance, map layer) | `src/ingest/roads.mjs` |
| 18 | NSW Land Parcel and Property Theme – Easement (9) and Lot (8) | DCS Spatial Services | CC BY 4.0, "© Spatial Services" | same Spatial Services licence statement | easement yes/no on the lot (lots fetched live per address and cached in `lot_cache`) | `src/ingest/easements.mjs` + `src/api.mjs` |

## Deliberately not used

| Dataset | Why |
|---------|-----|
| NSW Valuer General bulk Property Sales Information | CC BY-NC-ND: no prices, yields, medians or a home-built AVM in a paid tool until a commercial licence exists. `market/median-price-map`, `yield-pct`, `affordability` answer `available: false`. |
| OLG council time-series (rates) | All rights reserved. `development/council-rates` answers `available: false`. |
| Sydney Airport ANEF 2045 | PDF only; not digitised. Addresses outside an open ANEF/ANEC map get `aircraft_noise.assessed = false` and the suburb hazard counts return `aircraft_noise: {}` so the extension shows its "check the ANEF map / s10.7" note instead of a false GREEN. |
| Address-level public housing | No open source. `surroundings/public-housing` answers `available: false`; the SA1 share (Census G37 state housing authority landlord) is served in `risks/all.public_housing`. |
| NSW Flood Data Portal studies, historical flood extents | Agency-specific licences; `historical_flood.assessed = false`. |
| Microburbs street forecast, agent quoting | Stay on the Microburbs proxy path (not open data, not in scope). |
| Geoscience Australia Electricity Transmission Lines (CC BY 4.0) | Candidate for the HV power line row in phase 2; not loaded. |

## Attribution strings to show in any UI that uses this backend

- "Incorporates or developed using G-NAF © Geoscape Australia licensed by the Commonwealth of Australia under the Open Geo-coded National Address File (G-NAF) End User Licence Agreement."
- "Based on Australian Bureau of Statistics data (ASGS Edition 3, Census of Population and Housing 2021), CC BY 4.0."
- "© State of New South Wales (Department of Planning, Housing and Infrastructure), ePlanning spatial data, CC BY 4.0."
- "Bush Fire Prone Land © NSW Rural Fire Service 2025, CC BY."
- "© Spatial Services, NSW Department of Customer Service, CC BY 4.0."
- "Contaminated sites © State of New South Wales (NSW Environment Protection Authority), CC BY."
- "Coastal erosion © State of New South Wales (Department of Climate Change, Energy, the Environment and Water) 2025, CC BY 4.0."
- "Development applications © State of New South Wales (NSW Planning Portal Online DA Data API), CC BY."
- "Mortgage and rent affordability indicators © Commonwealth of Australia (Regional Data Hub), CC BY."
- "Taxation statistics © Australian Taxation Office, CC BY 2.5 AU."
- "Rental bond data © NSW Fair Trading, CC BY."
- "Timetable data © Transport for NSW, CC BY 4.0."
