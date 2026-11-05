import "./env-bootstrap.js";
import app from "../api/index.js";
import { Client } from "pg";
import { httpServerHandler } from "cloudflare:node";

app.listen(8787);
const expressHandler = httpServerHandler({ port: 8787 });

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
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
        api: "express",
        database: "not_checked"
      });
    }

    if (url.pathname === "/health/api") {
      if (request.method !== "GET") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }
      const expectedToken = workerEnv.OPENPOS_HEALTH_TOKEN;
      const authorization = request.headers.get("authorization") || "";
      if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
        return unauthorized();
      }
      try {
        const connectionString = workerEnv.HYPERDRIVE?.connectionString;
        const pool = connectionString ? app.configureDatabase(connectionString) : null;
        if (!pool) {
          return Response.json({ status: "error", databasePoolConfigured: false }, { status: 503 });
        }
        const dbResult = await pool.query("SELECT 1 AS connected, current_user AS database_role");

        const configRequest = new Request(new URL("/api/auth-config", request.url), { method: "GET" });
        const configResponse = await expressHandler.fetch(configRequest);
        const authConfig = await configResponse.json();

        const probe = new Request(new URL("/api/store", request.url), { method: "GET" });
        const response = await expressHandler.fetch(probe);
        const databaseConnected = dbResult.rows[0]?.connected === 1 &&
          dbResult.rows[0]?.database_role === "openpos_app";
        const authConfigured = authConfig.configured === true;
        const authProtected = response.status === 401;
        const ok = databaseConnected && authConfigured && authProtected;

        return Response.json({
          status: ok ? "ok" : "unexpected",
          databasePoolConfigured: true,
          databaseConnected,
          databaseRole: dbResult.rows[0]?.database_role || null,
          supabaseConfigured: authConfigured,
          unauthenticatedStatus: response.status
        }, { status: ok ? 200 : 503 });
      } catch (error) {
        console.error("OpenPOS protected API probe failed", {
          name: error?.name || "Error",
          message: error?.message || "Unknown initialization error"
        });
        return Response.json({
          status: "error",
          error: error?.message || "API initialization failed",
          stack: error?.stack ? error.stack.split("\n").slice(0, 8).join("\n") : null
        }, { status: 503 });
      }
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
        ssl: false,
        connectionTimeoutMillis: 5000
      });

      try {
        await client.connect();
        await client.query("SET ROLE openpos_app");
        const result = await client.query("SELECT 1 AS connected, current_user AS database_role");
        const connected = result.rows[0]?.connected === 1 &&
          result.rows[0]?.database_role === "openpos_app";
        return Response.json({
          status: connected ? "ok" : "unexpected",
          database: connected ? "connected" : "unexpected_result",
          databaseRole: result.rows[0]?.database_role || null
        }, { status: connected ? 200 : 503 });
      } catch (error) {
        console.error("OpenPOS Hyperdrive probe failed", {
          code: error?.code || "UNKNOWN"
        });
        return Response.json(
          { status: "error", database: "unavailable", errorCode: error?.code || error?.name || "UNKNOWN" },
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

    const connectionString = workerEnv.HYPERDRIVE?.connectionString;
    if (connectionString) app.configureDatabase(connectionString);
    return expressHandler.fetch(request);
  }
};
