const CACHE_NAME = "today-memo-todo-cache-v18";
const APP_FILES = [
  "./",
  "./index.html",
  "./style-v12.css?v=18",
  "./app-v12.js?v=18",
  "./db-v12.js?v=18",
  "./shared.js?v=18",
  "./shared-bridge.js?v=18",
  "./supabase-config.js?v=18",
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

  // Supabaseの認証・共有データ・CDN応答はService Workerへ保存しない。
  // 個人用PWAシェルと共有クラウドデータのキャッシュ境界を明確に保つ。
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

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
