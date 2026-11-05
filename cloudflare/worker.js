import "./env-bootstrap.js";
import app from "../api/index.js";
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
        service: workerEnv.SERVICE_NAME || "openpos",
        api: "express",
        database: "not_checked"
      });
    }

    const isApiOrHealthPath =
      url.pathname === "/api" ||
      url.pathname.startsWith("/api/") ||
      url.pathname === "/health" ||
      url.pathname.startsWith("/health/");

    if (!isApiOrHealthPath) {
      if (!workerEnv.ASSETS) {
        return Response.json({ error: "Static asset binding is not configured" }, { status: 503 });
      }
      const assetUrl = new URL(request.url);
      if (url.pathname === "/") assetUrl.pathname = "/index.html";
      if (url.pathname === "/order" || url.pathname === "/order/") assetUrl.pathname = "/order.html";
      if (url.pathname === "/kitchen" || url.pathname === "/kitchen/") assetUrl.pathname = "/kitchen.html";
      return workerEnv.ASSETS.fetch(new Request(assetUrl, request));
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
      let probeStage = "database_pool";
      try {
        const connectionString = workerEnv.HYPERDRIVE?.connectionString;
        const pool = connectionString ? app.configureDatabase(connectionString) : null;
        if (!pool) {
          return Response.json({ status: "error", databasePoolConfigured: false }, { status: 503 });
        }
        probeStage = "database_query";
        console.log("OpenPOS API probe: database query started");
        const dbResult = await pool.query("SELECT 1 AS connected, current_user AS database_role");
        console.log("OpenPOS API probe: database query completed", { databaseRole: dbResult.rows[0]?.database_role || null });

        probeStage = "auth_config";
        const configRequest = new Request(new URL("/api/auth-config", request.url), { method: "GET" });
        const configResponse = await expressHandler.fetch(configRequest);
        const authConfig = await configResponse.json();

        probeStage = "private_route_auth";
        const probe = new Request(new URL("/api/store", request.url), { method: "GET" });
        const response = await expressHandler.fetch(probe);
        // Consume the Node bridge response body so the underlying HTTP stream closes
        // before this Worker request returns its readiness JSON.
        await response.arrayBuffer();
        const databaseConnected = dbResult.rows[0]?.connected === 1;
        const authConfigured = authConfig.configured === true;
        const authProtected = response.status === 401;
        const ok = databaseConnected && authConfigured && authProtected;
        console.log("OpenPOS API probe completed", { databaseConnected, databaseRole: dbResult.rows[0]?.database_role || null, authConfigured, unauthenticatedStatus: response.status });

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
          stage: probeStage,
          name: error?.name || "Error",
          code: error?.code || null,
          message: error?.message || "Unknown initialization error"
        });
        return Response.json({
          status: "error",
          stage: probeStage,
          error: error?.message || "API initialization failed",
          stack: error?.stack ? error.stack.split("\n").slice(0, 8).join("\n") : null
        }, { status: 503 });
      }
    }

    const connectionString = workerEnv.HYPERDRIVE?.connectionString;
    if (connectionString) app.configureDatabase(connectionString);
    return expressHandler.fetch(request);
  }
};
