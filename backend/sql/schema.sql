-- mb-redflags open-data backend schema. Idempotent.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS ingest_state (
  source text NOT NULL, step text NOT NULL, done boolean NOT NULL DEFAULT false,
  cursor jsonb, note text, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (source, step));

-- G-NAF derived address table (NSW). Raw PSV staging tables are gnaf_raw_* (created by the loader).
CREATE TABLE IF NOT EXISTS address (
  gnaf_pid text PRIMARY KEY,
  flat_type text, flat_number text, level_number text,
  number_first text, number_last text,
  street_name text, street_type text, street_abbr text,
  locality text, postcode text, state text NOT NULL DEFAULT 'NSW',
  mb_2021 text, legal_parcel_id text, confidence smallint,
  abbr text NOT NULL, search_text text NOT NULL,
  geom geography(Point, 4326) NOT NULL);
CREATE INDEX IF NOT EXISTS address_geom_idx ON address USING gist (geom);
CREATE INDEX IF NOT EXISTS address_search_trgm ON address USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS address_loc_num ON address (locality, number_first);
CREATE INDEX IF NOT EXISTS address_mb ON address (mb_2021);
CREATE INDEX IF NOT EXISTS address_postcode ON address (postcode);

-- ABS ASGS 2021 mesh-block allocation (+ SAL 2021 and LGA 2025 allocation files).
CREATE TABLE IF NOT EXISTS asgs_mb (
  mb_code text PRIMARY KEY, mb_category text,
  sa1_code text, sa2_code text, sa2_name text, sa3_code text, sa3_name text, sa4_code text, sa4_name text,
  gccsa_code text, gccsa_name text, state_code text, state_name text, area_sqkm numeric,
  sal_code text, sal_name text, lga_code text, lga_name text);
CREATE INDEX IF NOT EXISTS asgs_mb_sa1 ON asgs_mb (sa1_code);
CREATE INDEX IF NOT EXISTS asgs_mb_sal ON asgs_mb (sal_name);
CREATE INDEX IF NOT EXISTS asgs_mb_sa2 ON asgs_mb (sa2_code);

-- Every polygon/line/point layer from ArcGIS services, keyed by source. props keeps the original attributes.
CREATE TABLE IF NOT EXISTS features (
  source text NOT NULL, fid text NOT NULL, props jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326) NOT NULL, PRIMARY KEY (source, fid));
CREATE INDEX IF NOT EXISTS features_geom_idx ON features USING gist (geom);
CREATE INDEX IF NOT EXISTS features_source_idx ON features (source);
CREATE TABLE IF NOT EXISTS features_stage (LIKE features INCLUDING ALL);

-- NSW Online DA Data API.
CREATE TABLE IF NOT EXISTS da (
  pan text PRIMARY KEY, council text, council_ref text, status text, app_type text,
  lodged date, determined date, last_updated timestamptz, cost numeric, dev_types text[],
  description text, address text, suburb text, postcode text, props jsonb NOT NULL,
  geom geography(Point, 4326));
CREATE INDEX IF NOT EXISTS da_geom_idx ON da USING gist (geom);
CREATE INDEX IF NOT EXISTS da_suburb_idx ON da (suburb, postcode);
CREATE INDEX IF NOT EXISTS da_lodged_idx ON da (lodged);

-- Census 2021 GCP at SA1: tenure/landlord (G37) and medians (G02).
CREATE TABLE IF NOT EXISTS census_sa1 (
  sa1_code text PRIMARY KEY,
  total_occ_private numeric, owned_outright numeric, owned_mortgage numeric, rented_total numeric,
  rented_re_agent numeric, rented_state_housing numeric, rented_private_landlord numeric, rented_community numeric, rented_other numeric,
  median_hhd_income_wk numeric, median_mortgage_month numeric, median_rent_wk numeric, median_age numeric, avg_household_size numeric);

-- Regional Data Hub mortgage/rent affordability indicators (MAID/RAID) at SA2, 2021.
CREATE TABLE IF NOT EXISTS afford_sa2 (
  sa2_code text PRIMARY KEY, sa2_name text,
  mortgage_hh numeric, mortgage_stress_hh numeric, mortgage_stress_pct numeric,
  rent_hh numeric, rent_stress_hh numeric, rent_stress_pct numeric, props jsonb);

-- ATO Taxation Statistics Individuals Table 25 by postcode (latest year loaded).
CREATE TABLE IF NOT EXISTS ato_postcode (
  postcode text PRIMARY KEY, income_year text, individuals numeric,
  net_rent_count numeric, net_rent_loss_count numeric, net_rent_profit_count numeric, net_rent_avg numeric, props jsonb);

-- NSW Fair Trading rental bond lodgements (per-bond rows, last 12 monthly files).
CREATE TABLE IF NOT EXISTS bond_lodgement (
  src_file text NOT NULL, lodged date, postcode text, dwelling_type text, bedrooms smallint, weekly_rent numeric);
CREATE INDEX IF NOT EXISTS bond_pc_idx ON bond_lodgement (postcode, dwelling_type);

-- TfNSW GTFS stops with the modes that serve them.
CREATE TABLE IF NOT EXISTS gtfs_stop (
  stop_id text PRIMARY KEY, stop_name text, parent_station text, location_type smallint, platform_code text,
  modes text[] NOT NULL DEFAULT '{}', geom geography(Point, 4326) NOT NULL);
CREATE INDEX IF NOT EXISTS gtfs_stop_geom_idx ON gtfs_stop USING gist (geom);

-- Derived helpers.
CREATE TABLE IF NOT EXISTS area_hull (kind text NOT NULL, code text NOT NULL, name text, geom geometry(MultiPolygon, 4326), PRIMARY KEY (kind, code));
CREATE INDEX IF NOT EXISTS area_hull_geom_idx ON area_hull USING gist (geom);
-- Live-fetched cadastral lots (Spatial Services), cached because open data has no caching restriction.
CREATE TABLE IF NOT EXISTS lot_cache (cadid text PRIMARY KEY, lotidstring text, props jsonb, geom geometry(MultiPolygon, 4326), fetched_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS lot_cache_geom_idx ON lot_cache USING gist (geom);

-- Geography indexes for metre-accurate nearest/within queries, and a small cache for suburb-wide aggregates
-- (open data has no caching restriction; Microburbs responses are never stored).
CREATE INDEX IF NOT EXISTS features_geog_idx ON features USING gist ((geom::geography));
CREATE TABLE IF NOT EXISTS api_cache (key text PRIMARY KEY, body jsonb NOT NULL, computed_at timestamptz NOT NULL DEFAULT now());

-- Per-address hazard flags for the Greater Sydney addresses (built by `make ingest-derived`), so suburb aggregates
-- (risks/extras, property-hazard-counts) are plain GROUP BYs instead of per-address spatial subqueries.
CREATE TABLE IF NOT EXISTS address_flags (
  gnaf_pid text PRIMARY KEY, mb text, sal_name text, sa1_code text, lga_name text,
  bushfire boolean NOT NULL DEFAULT false, flood boolean NOT NULL DEFAULT false, mine boolean NOT NULL DEFAULT false,
  ass_class text, contam250 boolean NOT NULL DEFAULT false, contam500 boolean NOT NULL DEFAULT false,
  anef_code text, anef_assessed boolean NOT NULL DEFAULT false, flood_assessed boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS address_flags_sal ON address_flags (sal_name);
CREATE INDEX IF NOT EXISTS address_flags_mb ON address_flags (mb);
