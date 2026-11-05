import { Client } from "pg";
import { httpServerHandler } from "cloudflare:node";
import process from "node:process";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// Express is loaded lazily inside the first non-health request. Cloudflare
// does not permit asynchronous module loading from the Worker global scope.
let expressHandlerPromise;

function getExpressHandler(workerEnv) {
  if (!expressHandlerPromise) {
    // Hyperdrive supplies its connection string at runtime. Other values are
    // also mapped explicitly so the legacy API can keep its existing config.
    process.env.OPENPOS_RUNTIME = "cloudflare";
    process.env.DATABASE_URL = workerEnv.HYPERDRIVE?.connectionString || "";
    process.env.PG_NO_SSL = "1";
    process.env.SUPABASE_URL = workerEnv.SUPABASE_URL || "";
    process.env.SUPABASE_ANON_KEY = workerEnv.SUPABASE_ANON_KEY || "";
    process.env.OPENPOS_OWNER_USER_ID = workerEnv.OPENPOS_OWNER_USER_ID || "";

    expressHandlerPromise = import("../api/index.js")
      .then(({ default: app }) => {
        app.listen(8787);
        return httpServerHandler({ port: 8787 });
      })
      .catch((error) => {
        // Allow a later request to retry initialization after a transient error.
        expressHandlerPromise = undefined;
        throw error;
      });
  }
  return expressHandlerPromise;
}

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
        api: "express_lazy",
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

    try {
      const handler = await getExpressHandler(workerEnv);
      return handler(request);
    } catch (error) {
      console.error("OpenPOS Express initialization failed", {
        code: error?.code || "UNKNOWN"
      });
      return Response.json(
        { error: "API initialization failed" },
        { status: 503 }
      );
    }
  }
};
