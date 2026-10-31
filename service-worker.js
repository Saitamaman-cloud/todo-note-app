const CACHE_NAME = "today-memo-todo-cache-v49";
const APP_FILES = [
  "./",
  "./index.html",
  "./style-v38.css?v=38",
  "./style-v39.css?v=39",
  "./style-v40.css?v=40",
  "./style-v41.css?v=41",
  "./style-v42.css?v=42",
  "./style-v45.css?v=45",
  "./style-v47.css?v=47",
  "./style-v48.css?v=48",
  "./style-v49.css?v=49",
  "./app-v47.js?v=47",
  "./db-v45.js?v=45",
  "./subtasks-v45.js?v=45",
  "./shared.js?v=32",
  "./shared-bridge.js?v=32",
  "./supabase-config.js?v=32",
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
