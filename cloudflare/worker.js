import { Client } from "pg";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// This isolated probe validates the Hyperdrive binding before the legacy API
// is adapted. It deliberately exposes no business data and is not a POS API.
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
      // Database probes open a real connection and must not be publicly callable.
      const expectedToken = env.OPENPOS_HEALTH_TOKEN;
      const authorization = request.headers.get("authorization") || "";
      if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
        return unauthorized();
      }

      if (!env.HYPERDRIVE?.connectionString) {
        return Response.json(
          { status: "error", database: "binding_not_configured" },
          { status: 503 },
        );
      }

      const client = new Client({
        connectionString: env.HYPERDRIVE.connectionString,
        connectionTimeoutMillis: 5000,
      });

      try {
        await client.connect();
        const result = await client.query("SELECT 1 AS connected");
        return Response.json({
          status: "ok",
          database: result.rows[0]?.connected === 1 ? "connected" : "unexpected_result",
        });
      } catch (error) {
        console.error("OpenPOS Hyperdrive probe failed", {
          code: error?.code || "UNKNOWN",
        });
        return Response.json(
          { status: "error", database: "unavailable" },
          { status: 503 },
        );
      } finally {
        try {
          await client.end();
        } catch (error) {
          console.error("OpenPOS Hyperdrive client cleanup failed", {
            code: error?.code || "UNKNOWN",
          });
        }
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
};
