/* 离线缓存：第一次联网打开后，页面、图标和车队视频都存进手机，以后没网也能用。
   页面优先走网络（联网时总能拿到最新版），断网时用缓存；视频和图标优先用缓存。 */
var CACHE = 'f1-vocab-20261026224256';
var VCACHE = 'f1-vocab-videos';   // 视频单独放，更新软件时不用重新下载 32MB 视频
var CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }));
});
var VIDEOS = ['videos/mclaren.mp4', 'videos/mercedes.mp4', 'videos/redbull.mp4', 'videos/ferrari.mp4', 'videos/williams.mp4', 'videos/bulls.mp4', 'videos/aston.mp4', 'videos/haas.mp4', 'videos/audi.mp4', 'videos/alpine.mp4', 'videos/cadillac.mp4'];
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE && k !== VCACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }).then(function () {
    /* 后台把 11 段车队视频都存下来（约 32MB，第一次最好连 Wi-Fi），一段一段来，失败的下次再补 */
    return caches.open(VCACHE).then(function (c) {
      return VIDEOS.reduce(function (p, v) {
        return p.then(function () {
          var u = new URL(v, self.registration.scope).href;
          return c.match(u).then(function (hit) {
            if (hit) return;
            return fetch(u).then(function (r) { if (r.status === 200) return c.put(u, r); }).catch(function () {});
          });
        });
      }, Promise.resolve());
    });
  }));
});

/* Safari 放视频是一小段一小段要的（Range 请求），缓存里有整段视频就切出要的那一段返回 */
function partial(resp, range) {
  return resp.blob().then(function (b) {
    var m = /bytes=(\d*)-(\d*)/.exec(range || ''), s = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : b.size - 1;
    end = Math.min(end, b.size - 1);
    return new Response(b.slice(s, end + 1, 'video/mp4'), { status: 206, statusText: 'Partial Content', headers: {
      'Content-Type': 'video/mp4', 'Content-Range': 'bytes ' + s + '-' + end + '/' + b.size,
      'Content-Length': String(end - s + 1), 'Accept-Ranges': 'bytes' } });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (/\.mp4$/.test(url.pathname)) {
    e.respondWith(caches.open(VCACHE).then(function (c) {
      return c.match(url.href).then(function (hit) {
        if (hit) return req.headers.get('range') ? partial(hit, req.headers.get('range')) : hit;
        e.waitUntil(fetch(url.href).then(function (r) { if (r.status === 200) return c.put(url.href, r); }).catch(function () {}));
        return fetch(req);
      });
    }));
    return;
  }

  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(function (r) {
      var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put('index.html', copy); });
      return r;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }

  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});