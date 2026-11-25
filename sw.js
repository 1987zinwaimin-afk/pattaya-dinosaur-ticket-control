const CACHE_NAME='dino-app-shell-v34';
const APP_SHELL=['/manifest.json','/staff-manifest.json','/file_000000006da082119bbf212e4f6fad52.png'];
// Shared Owner + Staff PWA shell. Push delivery behavior below remains unchanged.
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).catch(error=>console.warn('PWA shell precache skipped:',error)));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys()
  .then(keys=>Promise.all(keys.filter(key=>(key.startsWith('dino-staff-shell-')||key.startsWith('dino-app-shell-'))&&key!==CACHE_NAME).map(key=>caches.delete(key))))
  .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 if(req.mode==='navigate'){
  const cacheKey=new Request(url.origin+(url.pathname||'/'));
  event.respondWith(fetch(new Request(req,{cache:'no-store'})).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(cacheKey,copy));}
   return response;
  }).catch(()=>caches.match(cacheKey).then(hit=>hit||new Response(
   '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#041326"><title>Pattaya Dinosaur Kingdom</title><body style="margin:0;padding:32px;background:#041326;color:#f6f8fc;font:16px system-ui"><h2 style="color:#ffd778">Pattaya Dinosaur Kingdom</h2><p>You are offline. Reconnect to the internet to sign in and sync the latest ticket data.</p></body></html>',
   {headers:{'Content-Type':'text/html; charset=utf-8'}}
  ))));
  return;
 }
 if(url.pathname==='/manifest.json'||url.pathname==='/staff-manifest.json'){
  event.respondWith(fetch(new Request(req,{cache:'no-store'})).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));}
   return response;
  }).catch(()=>caches.match(req)));
 }
});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data={};
  try{data=event.data?event.data.json():{}}
  catch(_){try{data={body:event.data?event.data.text():'A staff member activity was recorded.'}}catch(__){}}
  let title=data.title||(data.event_type==='emergency_alarm'?'🚨 Alarm':data.event_type==='chat_message'?'💬 Team Chat':'Pattaya Dinosaur Kingdom');
  if(data.event_type==='chat_message'){
   // Match the Android emergency-alert card hierarchy: app name, event label, sender and message.
   title='Pattaya Dinosaur Kingdom';
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
  const isChat=data.event_type==='chat_message';
  const chatSender=String(data.sender_name||'Team member').trim().slice(0,80);
  const chatMessage=String(data.body||data.message||'New message').trim().slice(0,220);
  const options={
   body:isChat?'💬 TEAM CHAT\n'+chatSender+': '+chatMessage:(data.body||'A staff member activity was recorded.'),
   icon:data.icon||'/notification-logo.svg',
   badge:data.badge||'/notification-badge.svg',
   tag:data.tag||(data.event_type==='emergency_alarm'?'pdk-emergency-alarm-'+Date.now():isChat?'pdk-chat-'+String(data.message_id||Date.now()):'staff-activity-'+Date.now()),
   renotify:true,
   timestamp:Number(data.timestamp)||Date.now(),
   data:{url:data.url||'https://pattaya-dinosaur-ticket-control-eight.vercel.app/',event_type:data.event_type||'login',message_id:data.message_id||null},
   vibrate:data.event_type==='emergency_alarm'?[1200,300,1200,300,1600,300,1600]:data.event_type==='staff_site_reopened'?[400,150,400,150,800]:isChat?[300,120,300]:[250,100,250],
   silent:false, // Allow the OS/browser notification channel to play its configured sound.
   renotify:true,
   actions:(data.event_type==='emergency_alarm'||isChat||data.event_type==='login')?[{action:'open',title:'Open App'}]:[],
   requireInteraction:['emergency_alarm','chat_message','login','app_open','staff_site_reopened'].includes(data.event_type)
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
 const isStaffRestored=data.event_type==='staff_site_reopened';
 const target=(isEmergency||isChat||isStaffRestored)
  ? self.location.origin+'/staff.html'
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
