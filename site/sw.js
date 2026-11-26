// Service worker do HERUPU Mobile: guarda a "casca" do app para abrir rápido e funcionar como app instalado.
// As conversas com o cérebro sempre vão para a internet.
const VERSAO = "herupu-v28";
const CASCA = ["./", "index.html", "estilo.css", "nucleo.js", "app.js", "aovivo.js", "biblia.js", "manifest.webmanifest", "icone.svg", "icone-192.png", "icone-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // cérebro e fontes: direto na rede
  e.respondWith(
    fetch(e.request).then((resp) => {
      const copia = resp.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return resp;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
