const CACHE_NAME='dino-staff-shell-v4';
const APP_SHELL=['/staff-manifest.json','/notification-logo.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('dino-staff-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==self.location.origin)return;
 if(url.pathname==='/staff.html'&&req.mode==='navigate'){
  event.respondWith(fetch(new Request(req,{cache:'no-store'})));
  return;
 }
 if(req.mode==='navigate'||url.pathname==='/staff-manifest.json'){
  event.respondWith(fetch(new Request(req,{cache:'no-store'})).then(response=>{if(response.ok&&url.pathname!=='/staff.html'){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy))}return response}).catch(()=>caches.match(req).then(hit=>hit||caches.match('/staff-manifest.json'))));
 }
});
self.addEventListener('push',event=>{let data={};try{data=event.data?event.data.json():{}}catch(_){data={body:event.data?event.data.text():'A staff member activity was recorded.'}}const title=data.title||'Pattaya Dinosaur Kingdom';const options={body:data.body||'A staff member activity was recorded.',icon:data.icon||'/notification-logo.svg',badge:data.badge||'/notification-badge.svg',tag:data.tag||'staff-activity-'+Date.now(),renotify:true,timestamp:Number(data.timestamp)||Date.now(),data:{url:data.url||'https://pattaya-dinosaur-ticket-control.vercel.app/',event_type:data.event_type||'login'},vibrate:[250,100,250],requireInteraction:true};event.waitUntil(self.registration.showNotification(title,options))});
self.addEventListener('notificationclick',event=>{event.notification.close();const target=event.notification.data&&event.notification.data.url?event.notification.data.url:'https://pattaya-dinosaur-ticket-control.vercel.app/';event.waitUntil((async()=>{const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clientsList){if('focus'in client){try{await client.focus();if('navigate'in client)await client.navigate(target);return}catch(_){}}}if(self.clients.openWindow)await self.clients.openWindow(target)})())});
