const CACHE_NAME = "today-memo-todo-cache-v31";
const APP_FILES = [
  "./",
  "./index.html",
  "./style-v31.css?v=31",
  "./app-v31.js?v=31",
  "./db-v31.js?v=31",
  "./shared.js?v=31",
  "./shared-bridge.js?v=31",
  "./supabase-config.js?v=31",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// インストール時に個人機能と共有機能の両方をキャッシュする。
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

// 旧版キャッシュを削除し、共有非対応版が残らないようにする。
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Supabase、認証、Realtime、CDN応答はPWAキャッシュへ保存しない。
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "reload" }).catch(() => caches.match("./index.html"))
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
