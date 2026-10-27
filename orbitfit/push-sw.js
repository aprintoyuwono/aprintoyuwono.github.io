/* Orbit Fit reminders: runs inside the service worker (imported by the generated sw.js).
 * A push arrives with no body. We ask the reminder server what to say (/inbox), show it, and open
 * the right screen when it is tapped. Where to ask is saved by the app in the cache "orbit-push". */

async function readConfig() {
  try { const c = await caches.open("orbit-push"); const r = await c.match("/__push-config"); return r ? await r.json() : null; } catch (e) { return null; }
}

// Asking the server for the words can fail right when the push wakes the phone (the network is not back yet, or the
// words have not reached the server region this phone talks to). So it is tried again, and a plain notice that was
// already shown is replaced by the real one as soon as the words arrive.
const RETRY_AFTER_MS = [3000, 8000, 15000, 30000, 20000]; // about 76 s in total
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the messages waiting for this phone, or null when the server could not be reached
async function fetchInbox(cfg) {
  try {
    const r = await fetch(cfg.url + "/inbox?id=" + encodeURIComponent(cfg.id));
    if (!r.ok) return null;
    const j = await r.json();
    return j.messages || [];
  } catch (e) { return null; }
}

async function show(list) {
  const base = self.registration.scope;
  for (const m of list) {
    await self.registration.showNotification(m.title, {
      body: m.body, tag: m.tag || "orbit", icon: base + "icon-192.png", badge: base + "favicon-32.png",
      data: { go: m.go || "", type: m.type || "" },
      actions: m.type === "test" || m.type === "generic" ? [] : [{ action: "open", title: "Open" }, { action: "snooze", title: "Snooze 1 h" }],
    });
  }
}

const GENERIC = [{ title: "Orbit Fit", body: "You have a reminder.", go: "", type: "generic", tag: "orbit-generic" }];

async function showFromInbox() {
  const cfg = await readConfig();
  const canAsk = !!(cfg && cfg.url && cfg.id);
  let list = canAsk ? (await fetchInbox(cfg)) || [] : [];
  if (list.length) return show(list);
  // every push must show something, so the plain notice goes up first; then keep asking for the real words
  await show(GENERIC);
  if (!canAsk) return;
  for (const wait of RETRY_AFTER_MS) {
    await sleep(wait);
    list = (await fetchInbox(cfg)) || [];
    if (!list.length) continue;
    try { for (const n of await self.registration.getNotifications({ tag: "orbit-generic" })) n.close(); } catch (e) { /* ignore */ }
    return show(list);
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
