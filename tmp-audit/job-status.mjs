import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const ids = ["cb6dbf39-2963-4e8b-b393-29de5d40e397","fdb38eac-30a3-4b9e-9d7e-7c0e358fd2c0","ed8dd6d6-c64e-41db-965d-33b89748d4c0","ee035ebe-d3c3-43d3-8f0b-729bc69d07ba"];
const { data } = await sb.from("jobs").select("id, status, pro_id, created_at, completed_at").in("id", ids);
console.log(JSON.stringify(data, null, 2));
