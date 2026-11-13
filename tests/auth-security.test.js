const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

test("Root production Back Office and KDS enforce Supabase auth UI and Bearer interceptor", () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
  const kitchenHtml = fs.readFileSync(path.join(ROOT, "public/kitchen.html"), "utf8");
  const authClient = fs.readFileSync(path.join(ROOT, "public/auth-client.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "public/app.js"), "utf8");
  const kitchenJs = fs.readFileSync(path.join(ROOT, "public/kitchen.js"), "utf8");

  // App shells hidden until auth succeeds
  assert.match(indexHtml, /<div class="app-container" style="display:none;">/);
  assert.match(indexHtml, /id="openposLogin"/);
  assert.match(indexHtml, /id="logoutBtn"/);
  assert.match(indexHtml, /src="\/auth-client\.js"/);
  assert.equal(/<script src="\/app\.js"><\/script>/.test(indexHtml), false, "app.js must only load post-auth");

  assert.match(kitchenHtml, /id="kdsAppShell" style="display:none;/);
  assert.match(kitchenHtml, /id="openposKdsLogin"/);
  assert.match(kitchenHtml, /id="kdsLogoutBtn"/);
  assert.match(kitchenHtml, /src="\/auth-client\.js"/);
  assert.equal(/<script src="\/kitchen\.js"><\/script>/.test(kitchenHtml), false, "kitchen.js must only load post-auth");

  // Auth client has Bearer attachment, refresh, 401 expiry recovery, signOut, and export download
  assert.match(authClient, /Authorization['"],\s*`Bearer \$\{token\}`/);
  assert.match(authClient, /refreshSession\(/);
  assert.match(authClient, /response\.status === 401/);
  assert.match(authClient, /signOut\(/);
  assert.match(authClient, /\/api\/export\//);

  // Dynamic script boot safety (no DOMContentLoaded-only trap)
  assert.match(appJs, /document\.readyState === 'loading'/);
  assert.match(kitchenJs, /document\.readyState === 'loading'/);

  // Never expose service_role or server secrets in browser assets
  for (const [name, content] of [
    ["public/index.html", indexHtml],
    ["public/kitchen.html", kitchenHtml],
    ["public/auth-client.js", authClient],
    ["public/app.js", appJs],
    ["public/kitchen.js", kitchenJs]
  ]) {
    assert.equal(/service_role|SUPABASE_SERVICE_ROLE/i.test(content), false, `${name} must never reference service_role`);
  }
});

test("Protected API routes enforce 401 when Supabase auth is configured while keeping public storefront open", () => {
  const probeScript = `
    const http = require("node:http");
    const app = require("./api/index.js");
    (async () => {
      const server = http.createServer(app);
      await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address();
      const base = "http://127.0.0.1:" + port;

      const req = async (method, p, body) => {
        const res = await fetch(base + p, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined
        });
        return { status: res.status, json: await res.json().catch(() => null) };
      };

      const authConfig = await req("GET", "/api/auth-config");
      const statusPub = await req("GET", "/api/status");
      const catsPub = await req("GET", "/api/categories");
      const itemsPub = await req("GET", "/api/items");
      const storePriv = await req("GET", "/api/store");
      const kdsPriv = await req("GET", "/api/kitchen/tickets");
      const itemCreatePriv = await req("POST", "/api/items", { name: "Test", price: 5 });

      const invalidBearer = await fetch(base + "/api/store", {
        headers: { Authorization: "Bearer invalid.jwt.token" }
      });

      server.close();
      console.log(JSON.stringify({
        authConfig,
        statusPub: statusPub.status,
        catsPub: catsPub.status,
        itemsPub: itemsPub.status,
        storePriv: storePriv.status,
        kdsPriv: kdsPriv.status,
        itemCreatePriv: itemCreatePriv.status,
        invalidBearerStatus: invalidBearer.status
      }));
    })().catch(err => { console.error(err); process.exit(1); });
  `;

  const result = spawnSync(process.execPath, ["-e", probeScript], {
    cwd: ROOT,
    env: {
      ...process.env,
      SUPABASE_URL: "http://127.0.0.1:9", // unreachable mock URL -> invalid Bearer returns 401/503 without external call hanging long
      SUPABASE_ANON_KEY: "test-anon-key-not-secret",
      OPENPOS_RUNTIME: ""
    },
    encoding: "utf8",
    timeout: 15000
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout.trim().split("\n").pop());

  assert.equal(parsed.authConfig.status, 200);
  assert.equal(parsed.authConfig.json.configured, true);
  assert.equal(parsed.authConfig.json.supabaseConfigured, true);
  assert.equal(parsed.authConfig.json.localPreviewAllowed, false);
  assert.equal("serviceRoleKey" in parsed.authConfig.json, false);

  assert.equal(parsed.statusPub, 200);
  assert.equal(parsed.catsPub, 200);
  assert.equal(parsed.itemsPub, 200);

  assert.equal(parsed.storePriv, 401);
  assert.equal(parsed.kdsPriv, 401);
  assert.equal(parsed.itemCreatePriv, 401);
  assert.ok([401, 503].includes(parsed.invalidBearerStatus));
});
