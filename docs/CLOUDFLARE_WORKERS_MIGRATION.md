# OpenPOS Cloudflare deployment

## Current architecture

- The application UI is served from `public/` through Cloudflare Workers Static Assets.
- The clean routes `/`, `/order`, and `/kitchen` are routed to the corresponding HTML entry points.
- `/api/*` is handled by the existing Express API in `api/index.js`.
- The staging backend Worker is `openpos-cloudflare-staging`, backed by the existing Supabase PostgreSQL database through Hyperdrive.
- The production Worker `openpos` uses a Cloudflare Service Binding to forward requests to the validated backend Worker. This provides the free URL `https://openpos.b4u2store.workers.dev` without duplicating or exposing backend secrets.
- Vercel remains a separate deployment target. A Vercel deployment rate limit does not affect the Cloudflare workers.dev endpoint.

## Verification

The staging deployment workflow verifies:
1. The root storefront, ordering page, kitchen page, CSS, and JavaScript return HTTP 200.
2. The Express API can reach PostgreSQL through Hyperdrive.
3. Supabase authentication is configured.
4. An unauthenticated request to the private store API returns HTTP 401.
5. The repository test suite passes before deployment.

## Database and data integrity

- The baseline PostgreSQL schema contains 13 OpenPOS operational tables.
- Row Level Security is enabled on those tables.
- The database was verified empty during setup; no demo products, customers, receipts, or orders were inserted.
- Production-mode code fails closed when persistent storage is unavailable and does not use the local/demo fixture store.

## Important security limitation

The restricted `openpos_app` database role exists as a non-login, non-superuser, non-`BYPASSRLS` role, with table grants and RLS policies. However, the current Hyperdrive origin still authenticates through the Supabase `postgres` transaction-pooler credential. Attempts to change roles within a Hyperdrive transaction produced protocol errors, so the runtime currently uses the native PostgreSQL pool rather than forcing `SET LOCAL ROLE openpos_app`.

Consequently, PostgreSQL RLS is enabled but is **not an effective runtime security boundary while the connection is authenticated as `postgres`**, which has `BYPASSRLS`. The API currently relies on Supabase JWT validation and server-side authorization. Before enabling multiple stores/tenants or storing sensitive production data, provision a dedicated login role for Hyperdrive and verify that every transaction runs as that role. The current application-role policies also allow all rows to the trusted backend role and must be replaced with store-scoped policies for multi-tenant use.

## Deployment

- Staging backend: `https://openpos-cloudflare-staging.b4u2store.workers.dev`
- Production entry point: `https://openpos.b4u2store.workers.dev`
- Production is a Service Binding proxy to the validated backend Worker. The upstream Worker owns the Hyperdrive binding and Supabase secrets.
