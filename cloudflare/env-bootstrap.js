import { env } from "cloudflare:workers";
import process from "node:process";

// These bindings are safe to read synchronously at module initialization.
// Hyperdrive's connectionString is intentionally read inside fetch().
process.env.OPENPOS_RUNTIME = "cloudflare";
process.env.PG_NO_SSL = "1";
process.env.SUPABASE_URL = env.SUPABASE_URL || "";
process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || "";
process.env.OPENPOS_OWNER_USER_ID = env.OPENPOS_OWNER_USER_ID || "";
