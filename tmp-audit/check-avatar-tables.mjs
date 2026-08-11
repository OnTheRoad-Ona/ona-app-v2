process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check motorist_profiles for avatar
const { data: mp, error: e1 } = await sb.from("motorist_profiles").select("*").limit(3);
console.log("motorist_profiles columns:", e1 ? e1.message : Object.keys(mp?.[0] || {}));

// Check which table stores the avatar for the motorists who made requests
for (const id of ["0bfa5930-58b8-4c44-bdc9-5c147019a8f7", "bc9ae01c-cd38-4aae-8c76-c0b1ce2b375e"]) {
  const { data: p } = await sb.from("profiles").select("id, avatar_url, role").eq("id", id).maybeSingle();
  console.log(`profile ${id}:`, p ? `avatar=${p.avatar_url ? "YES" : "no"} role=${p.role}` : "missing");
  const { data: m } = await sb.from("motorist_profiles").select("avatar_url, user_id").eq("user_id", id).maybeSingle();
  console.log(`  motorist_profile:`, m ? `avatar=${m.avatar_url ? "YES" : "no"}` : "none");
}
