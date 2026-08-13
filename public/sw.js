/* Ona web-push service worker — real-time OS prompts.
 * Registered lazily when the app first needs push (an incoming request for a
 * Repair Pro). Push payloads are { title, body, url, tag, icon }.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* keep defaults */
  }
  const title = data.title || "Ona";
  const options = {
    body: data.body || "",
    tag: data.tag || "",
    data: { url: data.url || "" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "";
  event.waitUntil(
    (async () => {
      const existing = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of existing) {
        if ("focus" in client) {
          await client.focus();
          if (url && "navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* cross-context navigate may fail; focus is enough */
            }
          }
          return;
        }
      }
      if (url) await self.clients.openWindow(url);
    })()
  );
});