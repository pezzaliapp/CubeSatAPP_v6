/* CubeSatAPP v6 — Service Worker (stale-while-revalidate + versioned cache) */
const CACHE = 'cubesatapp-v6.0';
const ASSETS = [
  './','./index.html','./app.js','./styles.css','./manifest.json',
  './icons/icon-192.png','./icons/icon-512.png'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null))));
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(url.origin===location.origin){
    e.respondWith((async()=>{
      const cache = await caches.open(CACHE);
      const cached = await cache.match(e.request);
      const network = fetch(e.request).then(resp=>{
        cache.put(e.request, resp.clone());
        return resp;
      }).catch(()=>null);
      return cached || (await network) || new Response('Offline', {status:503, statusText:'Offline'});
    })());
  }
});
