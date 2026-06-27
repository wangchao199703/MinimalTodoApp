/*
 * 极简待办 Web/PWA Service Worker —— 让 app 可安装、离线可加载。
 * 缓存策略(刻意保守,避免「缓存坏」):
 *  - 导航请求(HTML):network-first → 离线回退缓存的应用壳;
 *  - 哈希命名的静态资源(/assets/*):cache-first(内容哈希变了文件名就变,天然不会取到旧版);
 *  - API/IndexedDB 不经此处(数据全在本地 IndexedDB,不缓存任何动态请求)。
 * CACHE 名带版本号,activate 时清掉旧版本,换版本即自动清理旧壳。
 */
const CACHE = "mt-web-v2.0.5-1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./"))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.includes("/assets/")) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
