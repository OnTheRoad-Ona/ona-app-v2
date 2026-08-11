import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
const id = process.argv[2] || "ffa84aa6-9623-4660-86cd-17cd2fa305b2";
const t = (label) => { const s = Date.now(); return () => `${label}: ${Date.now()-s}ms`; };
for (let i=0;i<3;i++){
  let e = t("base");
  const { data } = await sb.from("service_requests").select("*").eq("id", id).maybeSingle();
  console.log("iter", i, e());
}
