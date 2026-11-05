const CACHE_NAME='dino-staff-shell-v3';
const APP_SHELL=['/staff.html','/staff-manifest.json','/file_000000006da082119bbf212e4f6fad52.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('dino-staff-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==self.location.origin)return;
 if(req.mode==='navigate'||url.pathname==='/staff-manifest.json'){
  event.respondWith(fetch(new Request(req,{cache:'no-store'})).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy))}return response}).catch(()=>caches.match(req).then(hit=>hit||caches.match('/staff.html'))));
 }
});
self.addEventListener('push',event=>{let data={};try{data=event.data?event.data.json():{}}catch(_){data={body:event.data?event.data.text():'A staff member logged in.'}}const title=data.title||'Pattaya Dinosaur Kingdom';const options={body:data.body||'A staff member logged in.',tag:data.tag||'staff-login',renotify:true,data:{url:data.url||'https://pattaya-dinosaur-ticket-control.vercel.app/'},vibrate:[250,100,250],requireInteraction:true};event.waitUntil(self.registration.showNotification(title,options))});
self.addEventListener('notificationclick',event=>{event.notification.close();const target=event.notification.data&&event.notification.data.url?event.notification.data.url:'https://pattaya-dinosaur-ticket-control.vercel.app/';event.waitUntil((async()=>{const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clientsList){if('focus'in client){try{await client.focus();if('navigate'in client)await client.navigate(target);return}catch(_){}}}if(self.clients.openWindow)await self.clients.openWindow(target)})())});
