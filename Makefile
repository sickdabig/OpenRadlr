# OpenRadlr — common tasks. Run `make` to see all targets.
#
# Rust (cargo) and Node (node, npm) are required on the host.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Build number shown in the menu and /api/info (exported so `make dev` and a
# release binary started from make both report the git commit and date).
export OPENRADLR_BUILD_SHA ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
export OPENRADLR_BUILD_DATE ?= $(shell date -u +%Y-%m-%dT%H:%MZ)

CARGO := cd server && cargo
NODE := node
NPM := cd client && npm

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage: make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Run

.PHONY: setup
setup: ## Create .env from .env.example, or add settings that are new there
	@if [ -f .env ]; then sh tools/env-sync.sh .env.example .env; \
	else cp .env.example .env && echo "Created .env — adjust it if needed."; fi

##@ Develop

.PHONY: dev
dev: ## Run the server locally with cargo on http://0.0.0.0:7777 (LAN/Tailscale reachable; reads .env.dev, Strava keys from .env)
	cd server && set -a && { [ ! -f ../.env.dev ] || . ../.env.dev; } && \
		{ [ -n "$${OPENRADLR_STRAVA_CLIENT_ID:-}" ] || [ ! -f ../.env ] || eval "$$(grep -E '^OPENRADLR_STRAVA_CLIENT_(ID|SECRET)=' ../.env)"; } && \
		{ [ -z "$${OPENRADLR_STRAVA_CLIENT_ID:-}" ] || OPENRADLR_PUBLIC_URL="$${OPENRADLR_PUBLIC_URL:-http://localhost:7777}"; } && set +a && \
		OPENRADLR_STATIC_DIR=../client/public OPENRADLR_ROUTE_FILE=../routes/rolling-hills.json \
		OPENRADLR_BIND=0.0.0.0:7777 RUST_LOG=$${RUST_LOG:-info,openradlr_server=debug} cargo run --bin openradlr-server

.PHONY: dev-bike
dev-bike: ## Like dev, with the server owning a bike over Bluetooth (OPENRADLR_BIKE; needs BlueZ + libdbus)
	cd server && set -a && { [ ! -f ../.env.dev ] || . ../.env.dev; } && \
		{ [ -n "$${OPENRADLR_STRAVA_CLIENT_ID:-}" ] || [ ! -f ../.env ] || eval "$$(grep -E '^OPENRADLR_STRAVA_CLIENT_(ID|SECRET)=' ../.env)"; } && \
		{ [ -z "$${OPENRADLR_STRAVA_CLIENT_ID:-}" ] || OPENRADLR_PUBLIC_URL="$${OPENRADLR_PUBLIC_URL:-http://localhost:7777}"; } && set +a && \
		OPENRADLR_STATIC_DIR=../client/public OPENRADLR_ROUTE_FILE=../routes/rolling-hills.json \
		OPENRADLR_BIND=0.0.0.0:7777 RUST_LOG=$${RUST_LOG:-info,openradlr_server=debug} \
		cargo run --features bike --bin openradlr-server

.PHONY: test
test: test-server test-client ## Run all tests

.PHONY: test-server
test-server: ## Run the Rust tests (simulation, server, end-to-end)
	$(CARGO) test --workspace

.PHONY: test-client
test-client: ## Run the browser client tests
	$(NPM) test

.PHONY: build-server
build-server: ## Build the server binary (debug) for the headless browser tests
	$(CARGO) build --bin openradlr-server

.PHONY: test-e2e
test-e2e: build-server client/node_modules ## Headless browser tests: the real app in Chromium against the real server (once: npx playwright install chromium)
	$(NPM) exec -- playwright install chromium
	$(NPM) run test:e2e

.PHONY: lint
lint: lint-server lint-client ## Check formatting and lints

.PHONY: lint-server
lint-server: ## rustfmt check and clippy with warnings as errors
	$(CARGO) fmt --all -- --check
	$(CARGO) clippy --workspace --all-targets -- -D warnings

.PHONY: lint-client
lint-client: client/node_modules ## ESLint for the browser client
	$(NPM) run lint

.PHONY: screenshot
screenshot: client/node_modules ## Screenshot of the running client (start it first, e.g. `make dev`; pass ARGS="--out shot.png")
	$(NPM) run screenshot -- $(ARGS)

client/node_modules: client/package.json
	$(NPM) install --no-audit --no-fund
	@touch $@

.PHONY: fmt
fmt: ## Format the Rust code
	$(CARGO) fmt --all

.PHONY: check
check: lint test test-e2e ## Everything CI runs

.PHONY: routes
routes: ## Regenerate the bundled map's road network and routes (tools/valley-map.mjs)
	$(NODE) tools/valley-map.mjs

.PHONY: lock
lock: ## Create or refresh server/Cargo.lock (commit it afterwards)
	$(CARGO) generate-lockfile

.PHONY: clean
clean: ## Remove build output and local dependencies
	rm -rf server/target client/node_modules
