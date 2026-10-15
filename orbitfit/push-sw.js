/* Orbit Fit reminders: runs inside the service worker (imported by the generated sw.js).
 * A push arrives with no body. We ask the reminder server what to say (/inbox), show it, and open
 * the right screen when it is tapped. Where to ask is saved by the app in the cache "orbit-push". */

async function readConfig() {
  try { const c = await caches.open("orbit-push"); const r = await c.match("/__push-config"); return r ? await r.json() : null; } catch (e) { return null; }
}

async function showFromInbox() {
  const cfg = await readConfig();
  let list = [];
  if (cfg && cfg.url && cfg.id) {
    try { const r = await fetch(cfg.url + "/inbox?id=" + encodeURIComponent(cfg.id)); const j = await r.json(); list = j.messages || []; } catch (e) { /* offline: fall back below */ }
  }
  // every push must show something, so there is always a plain fallback
  if (!list.length) list = [{ title: "Orbit Fit", body: "You have a reminder.", go: "", type: "generic", tag: "orbit-generic" }];
  const base = self.registration.scope;
  for (const m of list) {
    await self.registration.showNotification(m.title, {
      body: m.body, tag: m.tag || "orbit", icon: base + "icon-192.png", badge: base + "favicon-32.png",
      data: { go: m.go || "", type: m.type || "" },
      actions: m.type === "test" || m.type === "generic" ? [] : [{ action: "open", title: "Open" }, { action: "snooze", title: "Snooze 1 h" }],
    });
  }
}

self.addEventListener("push", (event) => { event.waitUntil(showFromInbox()); });

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const data = n.data || {};
  n.close();
  event.waitUntil((async () => {
    if (event.action === "snooze") {
      const cfg = await readConfig();
      if (cfg) { try { await fetch(cfg.url + "/snooze", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ id: cfg.id, type: data.type, minutes: 60 }) }); } catch (e) { /* ignore */ } }
      return;
    }
    const base = self.registration.scope;
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.indexOf(base) === 0 && "focus" in c) { c.postMessage({ type: "orbit-go", go: data.go }); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(base + (data.go ? "?go=" + encodeURIComponent(data.go) : ""));
  })());
});
