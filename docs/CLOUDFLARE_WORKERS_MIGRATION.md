# OpenPOS Cloudflare Workers Migration

## Current status

This repository is currently deployed on Vercel. Keep that deployment as the production fallback until the Cloudflare Worker passes the acceptance checks below. Do not change the Vercel project, production branch, database, or DNS as part of this migration.

Cloudflare resources:
- Worker target: `openpos`
- Public URL target: `https://openpos.b4u2store.workers.dev`
- Hyperdrive configuration: `openpos-db`
- Hyperdrive is configured against the existing Supabase PostgreSQL database. Credentials must remain in Cloudflare and must never be committed.

## Current application architecture

- `api/index.js` exports an Express application.
- `OpenPOS-Backoffice/server.js` serves the static frontend and attaches the Express API.
- Vercel rewrites `/api/*` to `api/index.js`, and `/order` and `/kitchen` to their HTML files.
- The PostgreSQL pool is currently created from `process.env.DATABASE_URL` or `POSTGRES_URL`.
- The app also reads and writes `data/store_data.json` (or `/tmp/store_data.json` on Vercel) through synchronous `fs` calls.
- The API has a large in-code `DEFAULT_DATA` object containing example restaurant/catalog/order data. It must never be used as Cloudflare production data.

## Blocking issues before deployment

1. **Runtime database binding:** Cloudflare Hyperdrive exposes its connection string through the Worker binding, not Vercel's `DATABASE_URL`. The application needs an explicit runtime configuration bridge.
2. **Local filesystem persistence:** Workers do not provide a durable local filesystem. Any data currently written through `saveFileData()` would otherwise be lost between isolates/requests.
3. **Mixed persistence:** Some critical paths already use PostgreSQL repositories (catalog, ingredients, recipes, POS receipts/sales, kitchen tickets, online orders). Other paths still read or write the file-backed store, including store settings, audit events, waste logs, forecast inputs, temperature logs, checklists, and parts of sync/export/reset.
4. **Demo data fallback:** `loadFileData()` currently fills empty collections from `DEFAULT_DATA`. This behavior must be disabled in Cloudflare production. Empty database tables must remain empty; no sample restaurant data may be inserted or returned.
5. **Store configuration:** Online order tax calculation and status metadata currently read store settings from the file-backed object. These settings must be persisted and loaded from PostgreSQL before enabling online ordering on Cloudflare.
6. **HTTP adapter and static assets:** The Express app needs a supported Workers adapter (Cloudflare documents `httpServerHandler` with `nodejs_compat`). The static frontend must be served from Workers Static Assets, with explicit routes for `/order` and `/kitchen`.
7. **Startup and schema checks:** Database initialization currently logs schema errors but does not always fail startup/requests consistently. Cloudflare must fail closed when Hyperdrive or required tables are unavailable.

## Migration sequence

### Phase 1 — Runtime foundation (no production cutover)
- Add a Worker entry point and Workers configuration.
- Inject Hyperdrive and Supabase Auth configuration without embedding secrets.
- Add static asset routing for the back office, storefront, and KDS.
- Add a Cloudflare-specific empty data state; do not seed demo records.
- Add automated tests for runtime configuration and fail-closed behavior.

### Phase 2 — Complete PostgreSQL persistence
- Move store settings and audit logs to PostgreSQL.
- Move waste, temperature, checklist, and other file-backed operational records to PostgreSQL.
- Ensure sync responses read authoritative catalog/receipt data from PostgreSQL.
- Ensure reset operations never restore demo data and cannot silently ignore database errors.
- Remove file-backed production fallbacks.

### Phase 3 — Verification
- Run the full existing test suite and Cloudflare-specific tests.
- Deploy a non-production Worker version.
- Verify `/api/status` reports a successful PostgreSQL round trip.
- Verify authentication rejects missing/invalid tokens and owner authorization remains server-side.
- Verify empty production tables return empty collections, not sample records.
- Verify catalog CRUD, ingredient/recipe CRUD, online order creation, KDS updates, POS sale/receipt persistence, and exports against the existing database.
- Verify static routes `/`, `/order`, and `/kitchen`.
- Confirm no writes are lost across separate Worker requests.

### Phase 4 — Production cutover (requires explicit owner approval)
- Keep Vercel available as rollback until Cloudflare checks pass.
- Change the Android server URL and production DNS only after the user approves the cutover.
- Do not delete or reset the existing Supabase data.

## Acceptance rule

A successful Worker upload or a green health endpoint alone is not sufficient. Production cutover is blocked until every persistence and authentication check above passes. Never claim that Cloudflare is the production backend while API requests still depend on Vercel or in-memory state.
