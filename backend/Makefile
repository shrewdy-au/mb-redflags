# mb-redflags open-data backend. `make up && make ingest` builds the Greater Sydney database.
SHELL := /bin/bash
COMPOSE := docker compose

.PHONY: up down schema deps ingest ingest-% refresh-weekly refresh-nightly check psql clean-data

up:
	$(COMPOSE) up -d db
	@# first boot runs initdb, which starts and stops a temporary server: wait for two consecutive OKs
	@until $(COMPOSE) exec -T db pg_isready -U mbrf -d mbrf >/dev/null 2>&1 && sleep 2 && $(COMPOSE) exec -T db psql -U mbrf -d mbrf -c 'select 1' >/dev/null 2>&1; do sleep 1; done
	@echo "PostGIS ready on 127.0.0.1:5433 (db mbrf / user mbrf)"

down:
	$(COMPOSE) down

deps:
	@[ -d node_modules ] || npm install --no-audit --no-fund

schema: deps
	node src/schema.mjs

# Every source, in dependency order. Each step is idempotent and resumable: rerun `make ingest` after a failure.
ingest: up schema
	node src/ingest.mjs all

# One source: make ingest-gnaf, ingest-asgs, ingest-planning, ingest-hazards, ingest-da, ingest-census,
#             ingest-ato, ingest-bonds, ingest-gtfs, ingest-roads, ingest-easements, ingest-derived
ingest-%: up schema
	node src/ingest.mjs $*

# Cadence (see README): planning + hazards + roads + easements weekly, DAs nightly.
refresh-weekly: up schema
	node src/ingest.mjs --force planning hazards roads easements derived

refresh-nightly: up schema
	node src/ingest.mjs da

check: deps
	node src/check.mjs

psql:
	$(COMPOSE) exec db psql -U mbrf -d mbrf

clean-data:
	rm -rf data/raw data/work
