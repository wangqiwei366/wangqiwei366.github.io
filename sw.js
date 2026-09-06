/* ===========================================================
 * sw.js
 * ===========================================================
 * Copyright 2016 @huxpro
 * Licensed under Apache 2.0
 * service worker scripting
 * ========================================================== */

// CACHE_NAMESPACE
// CacheStorage is shared between all sites under same domain.
// A namespace can prevent potential name conflicts and mis-deletion.
const CACHE_NAMESPACE = 'kimi-v4-'

const CACHE = CACHE_NAMESPACE + 'precache-then-runtime';
const PRECACHE_LIST = [
  "./",
  "./offline.html",
  "./js/jquery.min.js",
  "./js/bootstrap.min.js",
  "./js/hux-blog.min.js",
  "./js/snackbar.js",
  "./img/icon_wechat.png",
  "./img/favicon-haibara.png",
  "./img/home-bg.jpg",
  "./img/404-bg.jpg",
  "./css/hux-blog.min.css",
  "./css/kimi-modern.css",
  "./css/bootstrap.min.css"
  // "//cdnjs.cloudflare.com/ajax/libs/font-awesome/4.6.3/css/font-awesome.min.css",
  // "//cdnjs.cloudflare.com/ajax/libs/font-awesome/4.6.3/fonts/fontawesome-webfont.woff2?v=4.6.3",
  // "//cdnjs.cloudflare.com/ajax/libs/fastclick/1.0.6/fastclick.min.js"
]
const HOSTNAME_WHITELIST = [
  self.location.hostname,
  "cdnjs.cloudflare.com"
]
const DEPRECATED_CACHES = ['precache-v1', 'runtime', 'main-precache-v1', 'main-runtime']


// The Util Function to hack URLs of intercepted requests
const getCacheBustingUrl = (req) => {
  var now = Date.now();
  url = new URL(req.url)

  // 1. fixed http URL
  // Just keep syncing with location.protocol
  // fetch(httpURL) belongs to active mixed content.
  // And fetch(httpRequest) is not supported yet.
  url.protocol = self.location.protocol

  // 2. add query for caching-busting.
  // Github Pages served with Cache-Control: max-age=600
  // max-age on mutable content is error-prone, with SW life of bugs can even extend.
  // Until cache mode of Fetch API landed, we have to workaround with query string.
  // Cache-Control-Bug: https://bugs.chromium.org/p/chromium/issues/detail?id=453190

  url.search += (url.search ? '&' : '?') + 'cache-bust=' + now;
  return url.href
}

// The Util Function to detect and polyfill req.mode="navigate"
const isNavigationReq = (req) => (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept').includes('text/html')))

// The Util Function to detect if a req is end with extension
const endWithExtension = (req) => Boolean(new URL(req.url).pathname.match(/.\w+$/))

// Redirect in SW manually fixed github pages arbitrary 404s
const shouldRedirect = (req) => (isNavigationReq(req) && new URL(req.url).pathname.substr(-1) !== "/" && !endWithExtension(req))

const getRedirectUrl = (req) => {
  url = new URL(req.url)
  url.pathname += "/"
  return url.href
}


/**
 * @Lifecycle Install
 */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE_LIST))
      .then(() => self.skipWaiting())
      .catch(err => console.log(err))
  )
});

/**
 * @Lifecycle Activate
 */
self.addEventListener('activate', event => {
  console.log('service worker activated.')
  event.waitUntil(Promise.all([
    caches.keys().then(cacheNames => Promise.all(
      cacheNames
        .filter(cacheName => cacheName !== CACHE && (cacheName.startsWith('kimi-') || DEPRECATED_CACHES.includes(cacheName)))
        .map(cacheName => caches.delete(cacheName))
    )),
    self.clients.claim()
  ]));
});

var fetchHelper = {
  fetchThenCache: function(request){
    const init = { mode: "cors", credentials: "omit" }
    const fetched = fetch(request, init)
    const fetchedCopy = fetched.then(resp => resp.clone());
    Promise.all([fetchedCopy, caches.open(CACHE)])
      .then(([response, cache]) => response.ok && cache.put(request, response))
      .catch(_ => {/* eat any errors */})
    return fetched;
  },

  cacheFirst: function(url){
    return caches.match(url)
      .then(resp => resp || this.fetchThenCache(url))
      .catch(_ => {/* eat any errors */})
  }
}

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // The admin console cannot work offline. Never serve stale management code.
  if (requestUrl.hostname === self.location.hostname && (requestUrl.pathname === '/admin' || requestUrl.pathname.startsWith('/admin/'))) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Pages must be fresh after publishing. Try the network first for every HTML navigation, while keeping the cached page as an offline fallback.
  if (requestUrl.hostname === self.location.hostname && isNavigationReq(event.request)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response.ok) {
            event.waitUntil(
              caches.open(CACHE)
                .then(cache => cache.put(event.request, response.clone()))
                .catch(_ => {/* keep navigation working if CacheStorage fails */})
            );
          }
          return response;
        })
        .catch(() => caches.match(event.request)
          .then(response => response || caches.match('./offline.html')))
    );
    return;
  }

  // Skip some cross-origin requests, like Google Analytics.
  if (HOSTNAME_WHITELIST.indexOf(requestUrl.hostname) > -1) {
    if (shouldRedirect(event.request)) {
      event.respondWith(Response.redirect(getRedirectUrl(event.request)))
      return;
    }

    if (event.request.url.indexOf('ys.static') > -1){
      event.respondWith(fetchHelper.cacheFirst(event.request.url))
      return;
    }

    const cached = caches.match(event.request);
    const fetched = fetch(getCacheBustingUrl(event.request), { cache: "no-store" });
    const fetchedCopy = fetched.then(resp => resp.clone());

    event.respondWith(
      Promise.race([fetched.catch(_ => cached), cached])
        .then(resp => resp || fetched)
        .catch(_ => caches.match('offline.html'))
    );

    event.waitUntil(
      Promise.all([fetchedCopy, caches.open(CACHE)])
        .then(([response, cache]) => response.ok && cache.put(event.request, response))
        .catch(_ => {/* eat any errors */ })
    );
  }
});
