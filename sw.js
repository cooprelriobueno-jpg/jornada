/* Guarda la app en el teléfono para que abra sin señal.
   - Con buena señal toma siempre la versión más nueva.
   - Si la red se queda "pensando" (señal a medias), espera hasta ESPERA milisegundos y abre la versión guardada,
     en vez de dejar la pantalla en blanco. La actualización sigue descargándose por detrás y se usa la próxima vez.
   - Si todavía no hay nada guardado (primera vez), no queda más que esperar a la red. */
var C = "jornada-v8";
var FILES = ["./", "index.html", "config.js", "manifest.webmanifest", "logo-cooprel.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png",
  "font-barlow-400.woff2", "font-barlow-500.woff2", "font-barlow-600.woff2", "font-barlow-condensed-600.woff2", "font-barlow-condensed-700.woff2"];
var ESPERA = 5000;   /* milisegundos que se espera a la red antes de abrir lo guardado */

self.addEventListener("install", function (e) {
  /* Cada archivo por separado: si alguno falta, los demás igual se guardan. */
  e.waitUntil(caches.open(C).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  /* La red se consulta siempre y, si responde bien, lo guardado se renueva (aunque ya se haya abierto lo guardado). */
  var red = fetch(e.request).then(function (r) {
    if (r && r.ok) { var cp = r.clone(); caches.open(C).then(function (c) { c.put(e.request, cp); }); }
    return r;
  });
  e.waitUntil(red.catch(function () {}));
  var pagina = e.request.mode === "navigate";
  e.respondWith(caches.match(e.request).then(function (guardado) {
    return guardado || (pagina ? caches.match("index.html") : undefined);
  }).then(function (g) {
    if (!g) return red;                      /* nada guardado: no queda otra que esperar a la red */
    if (!pagina) return g;                   /* íconos, letras y config: al tiro desde lo guardado; se renuevan por detrás */
    return new Promise(function (resolve) {
      var listo = false;
      var t = setTimeout(function () { if (!listo) { listo = true; resolve(g); } }, ESPERA);
      red.then(function (r) {
        if (listo) return;
        listo = true; clearTimeout(t);
        /* Si el servidor respondió con error (caído, 404...), es mejor abrir lo guardado. Los redireccionamientos se dejan pasar. */
        resolve(r && (r.ok || r.type === "opaqueredirect") ? r : g);
      }, function () { if (!listo) { listo = true; clearTimeout(t); resolve(g); } });
    });
  }));
});
