const CACHE_NAME='dino-staff-shell-v28';
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
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data={};
  try{data=event.data?event.data.json():{}}
  catch(_){try{data={body:event.data?event.data.text():'A staff member activity was recorded.'}}catch(__){}}
  let title=data.title||(data.event_type==='emergency_alarm'?'🚨 Alarm':data.event_type==='chat_message'?'💬 Team Chat':'Pattaya Dinosaur Kingdom');
  if(data.event_type==='chat_message'){
   const sender=String(data.sender_name||title||'Team member').trim();
   title='💬 '+sender;
  }
  if(data.event_type==='chat_message'){
   try{
    const openClients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const appClient of openClients){
     const path=new URL(appClient.url).pathname;
     const isOwnerApp=path==='/'||path.endsWith('/index.html');
     const isNormalStaffApp=path.endsWith('/staff.html');
     if(isOwnerApp||isNormalStaffApp)appClient.postMessage({type:'STAFF_CHAT_MESSAGE_VOICE',event_type:'chat_message',sender_name:data.sender_name||'Team member',body:data.body||'New message'});
    }
   }catch(voiceError){console.warn('Could not relay Team Chat notification to open app:',voiceError)}
  }
  if(data.event_type==='emergency_alarm'){
   // Keep the sender's name, but never expose role, department, or Staff ID.
   const rawTitle=String(data.title||title||'').trim();
   const clean=value=>String(value||'').replace(/\s*[·|—-]\s*(?:(?:Owner|Staff|Teen)\b.*|ID\s*[:#-]?.*)$/i,'').trim();
   const parts=rawTitle.split(/\s*[·|—]\s*/).map(part=>part.trim()).filter(Boolean);
   const prefix=(parts[0]||'').replace(/^🚨\s*/,'').trim();
   const suppliedName=String(data.sender_name||data.display_name||'').trim();
   let senderName='';
   if(/^Alarm$/i.test(prefix)) senderName=clean(parts[1]||suppliedName);
   else if(parts.length>1) senderName=clean(parts[1]);
   else senderName=clean(suppliedName);
   title=senderName?'🚨 Alarm · '+senderName:'🚨 Alarm';
  }
  const options={
   body:data.body||'A staff member activity was recorded.',
   icon:data.icon||'/notification-logo.svg',
   badge:data.badge||'/notification-badge.svg',
   tag:data.tag||(data.event_type==='emergency_alarm'?'pdk-emergency-alarm-'+Date.now():'staff-activity-'+Date.now()),
   renotify:true,
   timestamp:Number(data.timestamp)||Date.now(),
   data:{url:data.url||'https://pattaya-dinosaur-ticket-control-eight.vercel.app/',event_type:data.event_type||'login'},
   vibrate:data.event_type==='emergency_alarm'?[1200,300,1200,300,1600,300,1600]:data.event_type==='chat_message'?[300,120,300]:[250,100,250],
   silent:false,
   renotify:true,
   actions:data.event_type==='emergency_alarm'?[{action:'open',title:'Open Staff App'}]:[],
   requireInteraction:data.event_type==='emergency_alarm'
  };
  if(data.event_type==='emergency_alarm'){
   try{
    const openClients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const appClient of openClients){
     const path=new URL(appClient.url).pathname;
     const isOwnerApp=path==='/'||path.endsWith('/index.html');
     const isNormalStaffApp=path.endsWith('/staff.html');
     if(isOwnerApp||isNormalStaffApp)appClient.postMessage({type:'STAFF_EMERGENCY_VOICE',event_type:'emergency_alarm',body:options.body});
    }
   }catch(voiceError){console.warn('Could not relay emergency voice alert to Owner/Normal Staff pages:',voiceError)}
  }
  try{await self.registration.showNotification(title,options)}
  catch(error){console.error('Could not display staff activity push notification:',error)}
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const data=event.notification.data||{};
 const isEmergency=data.event_type==='emergency_alarm';
 const isStaffOrigin=self.location.hostname==='pattaya-dinosaur-ticket-control.vercel.app';
 const isChat=data.event_type==='chat_message';
 const target=(isEmergency||isChat)
  ? self.location.origin+(isStaffOrigin?'/staff.html':'/')
  : (data.url||self.location.origin+'/');
 event.waitUntil((async()=>{
  const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clientsList){
   if('focus'in client){
    try{await client.focus();if('navigate'in client)await client.navigate(target);return}catch(_){}
   }
  }
  if(self.clients.openWindow)await self.clients.openWindow(target);
 })());
});
