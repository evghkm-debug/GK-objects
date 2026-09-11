const CACHE='objects-mvp-v041';
const ASSETS=['./','./index.html','./styles.css?v=0.4.1','./app.js?v=0.4.1','./cloud-config.js?v=0.4.1','./gk-core.js?v=0.4.1','./gk-store.js?v=0.4.1','./gk-sync.js?v=0.4.1','./gk-photos.js?v=0.4.1','./vendor/jszip.min.js?v=0.4.1','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('objects-mvp-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()
])));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).then(response=>{
    if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}
    return response;
  }).catch(async()=>await caches.match(e.request)||(e.request.mode==='navigate'?await caches.match('./index.html'):Response.error())));
});
