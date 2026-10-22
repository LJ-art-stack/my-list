/* 离线缓存：只在通过网址（http/https）访问时生效，本地文件打开不会注册
   策略：
   - 页面（导航请求）网络优先，3 秒没响应就用缓存 —— 这样你更新站点后手机上总能拿到新版
   - 图标等静态资源缓存优先，后台静默更新 */
var CACHE = 'daily-list-v3';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .catch(function () {})
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function store(req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}

function networkFirst(req) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      caches.match('./index.html').then(function (hit) {
        if (settled || !hit) return;
        settled = true;
        resolve(hit);
      });
    }, 3000);

    fetch(req).then(function (res) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
      }
      resolve(res);
    }).catch(function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      caches.match('./index.html').then(function (hit) {
        resolve(hit || Response.error());
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req));
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { return store(req, res); }).catch(function () { return null; });
      return hit || net.then(function (res) { return res || Response.error(); });
    })
  );
});
