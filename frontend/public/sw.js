/* InstaSave service worker — cache seletivo só de arquivos estáticos versionados.
   Nunca guarda /api/*, mídia, respostas variáveis ou conteúdo do Instagram. */
const VERSION = "__BUILD__";
const CACHE = `instasave-static-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("instasave-static-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(async () => (await caches.match("/index.html")) || (await caches.match("/offline.html")) || Response.error()),
    );
    return;
  }
  if (!PRECACHE.includes(url.pathname)) return; // só o que foi pré-cacheado
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
