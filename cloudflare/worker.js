import { Pool } from "pg";

// This isolated probe validates the Hyperdrive binding before the legacy API
// is adapted. It deliberately exposes no business data and is not a POS API.
let pool;

function getPool(env) {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error("HYPERDRIVE binding is not configured");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.HYPERDRIVE.connectionString,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
  }

  return pool;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "openpos-cloudflare-staging",
        database: "not_checked",
      });
    }

    if (url.pathname === "/health/db") {
      try {
        const result = await getPool(env).query("SELECT 1 AS connected");
        return Response.json({
          status: "ok",
          database: result.rows[0]?.connected === 1 ? "connected" : "unexpected_result",
        });
      } catch (error) {
        // Do not return connection strings, credentials, or raw driver errors.
        console.error("OpenPOS Hyperdrive probe failed", {
          code: error?.code || "UNKNOWN",
        });
        return Response.json(
          { status: "error", database: "unavailable" },
          { status: 503 },
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
};
