import { Client } from "pg";
import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import process from "node:process";
import { createRequire } from "node:module";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// Map Cloudflare bindings into the legacy API's Node.js configuration before
// loading it. Hyperdrive owns the upstream TLS connection, so pg must not
// attempt to establish a second TLS layer.
process.env.OPENPOS_RUNTIME = "cloudflare";
process.env.DATABASE_URL = env.HYPERDRIVE?.connectionString || "";
process.env.PG_NO_SSL = "1";
process.env.SUPABASE_URL = env.SUPABASE_URL || "";
process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || "";
process.env.OPENPOS_OWNER_USER_ID = env.OPENPOS_OWNER_USER_ID || "";

const require = createRequire(import.meta.url);
const app = require("../api/index.js");
app.listen(8787);
const expressHandler = httpServerHandler({ port: 8787 });

export default {
  async fetch(request, workerEnv) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      if (request.method !== "GET") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }
      return Response.json({
        status: "ok",
        service: "openpos-cloudflare-staging",
        api: "express",
        database: "not_checked"
      });
    }

    if (url.pathname === "/health/db") {
      if (request.method !== "GET") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }
      const expectedToken = workerEnv.OPENPOS_HEALTH_TOKEN;
      const authorization = request.headers.get("authorization") || "";
      if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
        return unauthorized();
      }

      if (!workerEnv.HYPERDRIVE?.connectionString) {
        return Response.json(
          { status: "error", database: "binding_not_configured" },
          { status: 503 }
        );
      }

      const client = new Client({
        connectionString: workerEnv.HYPERDRIVE.connectionString,
        connectionTimeoutMillis: 5000
      });

      try {
        await client.connect();
        const result = await client.query("SELECT 1 AS connected");
        return Response.json({
          status: "ok",
          database: result.rows[0]?.connected === 1 ? "connected" : "unexpected_result"
        });
      } catch (error) {
        console.error("OpenPOS Hyperdrive probe failed", {
          code: error?.code || "UNKNOWN"
        });
        return Response.json(
          { status: "error", database: "unavailable" },
          { status: 503 }
        );
      } finally {
        try {
          await client.end();
        } catch (error) {
          console.error("OpenPOS Hyperdrive client cleanup failed", {
            code: error?.code || "UNKNOWN"
          });
        }
      }
    }

    return expressHandler(request);
  }
};
