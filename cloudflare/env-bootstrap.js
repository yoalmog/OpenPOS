import { env } from "cloudflare:workers";
import process from "node:process";

// Populate the legacy API's Node.js configuration before its static import.
// These are synchronous binding reads and environment assignments only.
process.env.OPENPOS_RUNTIME = "cloudflare";
process.env.DATABASE_URL = env.HYPERDRIVE?.connectionString || "";
process.env.PG_NO_SSL = "1";
process.env.SUPABASE_URL = env.SUPABASE_URL || "";
process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || "";
process.env.OPENPOS_OWNER_USER_ID = env.OPENPOS_OWNER_USER_ID || "";
