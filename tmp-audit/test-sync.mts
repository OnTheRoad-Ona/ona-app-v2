process.loadEnvFile(".env.local");
const { createJob, listJobsForUser, getJob } = await import(
  "/Users/mac/Desktop/Code/Ona/src/lib/server/jobs/job-store.ts"
);

// Create a test job as King (0bfa5930) with voice + photo + 1 photo, assigned to a pro
const res = await createJob({
  motoristId: "0bfa5930-58b8-4c44-bdc9-5c147019a8f7",
  motoristName: "King Test",
  motoristPhoto: "https://rvhvzcphzusemwmlffdb.supabase.co/storage/v1/object/public/avatars/test-avatar.jpg",
  repairProId: "ad5430e2-355d-4889-a6cc-e7f1fe45d8ec",
  repairProName: "Oluwatosin",
  repairProPhoto: undefined,
  serviceType: "mechanic",
  problem: "Test voice sync please ignore",
  voiceNote: { id: "voice_test1", kind: "voice", url: "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRCAAA=", durationSec: 3, createdAt: new Date().toISOString(), uploadedBy: "0bfa5930-58b8-4c44-bdc9-5c147019a8f7" },
  photos: [],
  currency: "NGN",
  proBaseMajor: 5000,
  locationLabel: "Test location",
  motoristLocation: { lat: 6.5, lng: 3.5 },
  radiusKm: 5,
} as any);

console.log("createJob returned id:", res.id);
console.log("  voiceNote:", res.voiceNote ? "YES" : "NO");
console.log("  motoristPhoto:", res.motoristPhoto ? "YES" : "NO");

// Now list as the pro — same thing the popup does
const list = await listJobsForUser("ad5430e2-355d-4889-a6cc-e7f1fe45d8ec", "repair_pro");
const mine = list.find((j) => j.id === res.id);
console.log("\npro listJobsForUser found:", mine ? "YES" : "NO");
if (mine) {
  console.log("  status:", mine.status, "| photos:", mine.photos?.length, "| voiceNote:", mine.voiceNote ? "YES" : "NO", "| motoristPhoto:", mine.motoristPhoto ? "YES" : "NO");
}

// Now getJob (detail fetch)
const detail = await getJob(res.id);
console.log("\ngetJob voiceNote:", detail?.voiceNote ? "YES" : "NO", "| motoristPhoto:", detail?.motoristPhoto ? "YES" : "NO");

// cleanup: delete test job
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
await sb.from("service_requests").delete().eq("id", res.id);
console.log("\ncleaned up test job");
