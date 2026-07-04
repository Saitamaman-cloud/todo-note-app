const CACHE_NAME = "today-memo-todo-cache-v6";
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css?v=6",
  "./app.js?v=6",
  "./db.js?v=6",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// インストール時に主要ファイルをキャッシュする。
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除する。
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// オフライン時もアプリ本体を返せるようにする。
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => (
      cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
    ))
  );
});
