/**
 * Unit checks for chat-expired rules
 * Run: node scripts/test-chat-expired.mjs
 */

const JOB_LIVE_CHAT_STATUSES = new Set([
  "negotiating",
  "accepted",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
]);

function isJobEndedStatus(status) {
  if (status == null || status === "") return false;
  const s = String(status).toLowerCase().trim();
  if (!s) return false;
  return !JOB_LIVE_CHAT_STATUSES.has(s);
}

function isDemoJobOrHref(href, jobId) {
  const h = href || "";
  const j = jobId || "";
  return /demo[-_]/i.test(h) || /demo[-_]/i.test(j);
}

function shouldBlockLiveOpen(input) {
  const action = input.actionType || null;
  if (input.allowRate !== false && action === "rate") return false;
  if (action === "none") return true;

  const status = input.liveStatus || input.jobStatus || null;
  const href = input.href || "";
  const jobId = input.jobId || null;
  const cat = input.category || "";
  const payload = input.actionPayload || {};

  if (payload.chatClosed === true || payload.closed === true) return true;

  const chatLike =
    action === "open_chat" || cat === "messages" || href.includes("/messages/");
  const jobLike =
    action === "open_job" ||
    action === "view_tracking" ||
    action === "accept_request" ||
    cat === "requests" ||
    href.includes("/jobs/") ||
    href.includes("/requests/");

  if (isDemoJobOrHref(href, jobId) && (chatLike || jobLike)) return true;
  if (isJobEndedStatus(status)) return true;
  if (jobLike && status && JOB_LIVE_CHAT_STATUSES.has(String(status).toLowerCase()) === false)
    return true;
  return false;
}

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    console.error("FAIL:", name);
    failed++;
  } else console.log("ok:", name);
}

for (const s of JOB_LIVE_CHAT_STATUSES) {
  assert(`live ${s}`, isJobEndedStatus(s) === false);
}
for (const s of [
  "completed",
  "satisfied",
  "released",
  "cancelled",
  "expired",
  "refunded",
  "disputed",
  "under_appeal",
]) {
  assert(`ended ${s}`, isJobEndedStatus(s) === true);
}

assert(
  "block finished chat",
  shouldBlockLiveOpen({
    actionType: "open_chat",
    href: "/messages/abc",
    jobStatus: "completed",
  }) === true
);
assert(
  "block demo job",
  shouldBlockLiveOpen({
    actionType: "open_job",
    href: "/jobs/demo-job-m1",
    jobId: "demo-job-m1",
  }) === true
);
assert(
  "allow live job",
  shouldBlockLiveOpen({
    actionType: "open_job",
    href: "/jobs/real-uuid",
    jobStatus: "en_route",
  }) === false
);
assert(
  "allow rate",
  shouldBlockLiveOpen({
    actionType: "rate",
    href: "/jobs/x",
    jobStatus: "completed",
  }) === false
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll chat-expired checks passed.");
