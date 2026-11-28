(function(){
 'use strict';
 if(window.__pdkAccountProfileV1)return;
 window.__pdkAccountProfileV1=true;
 const $=id=>document.getElementById(id);
 const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const deptNames={sale:'Sale Department',entry:'Entry Department',playing:'Playing Department',event:'Event Department',all:'All Departments'};
 const platformOptions=['Facebook','LINE','Instagram','TikTok','WhatsApp','Telegram','Other'];
 let activeUser=null,activeProfile=null,modalBusy=false,authSubscription=null,navObserver=null,pageObserver=null,directoryTimer=null;
 function addStyles(){
  if($('pdkAccountProfileStyles'))return;
  const style=document.createElement('style');style.id='pdkAccountProfileStyles';
  style.textContent='#pdkMyProfileButton{display:flex!important;align-items:center!important;gap:9px!important;width:100%!important;min-height:48px!important;margin:8px 0 12px!important;padding:11px 14px!important;border:1px solid rgba(244,202,112,.48)!important;border-radius:13px!important;background:linear-gradient(135deg,#1b4568,#102b47)!important;color:#ffe1a0!important;font-weight:850!important;text-align:left!important}'+
   '#pdkAccountProfileModal{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:12px;padding-top:max(12px,env(safe-area-inset-top));padding-bottom:max(12px,env(safe-area-inset-bottom));background:rgba(0,7,16,.78);backdrop-filter:blur(9px)}'+
   '#pdkAccountProfileModal.open{display:flex}'+
   '#pdkAccountProfileModal .pdk-ap-card{width:min(540px,100%);max-height:calc(100dvh - 24px);overflow:auto;border:1px solid rgba(244,202,112,.4);border-radius:20px;background:linear-gradient(150deg,#102d49,#06172a);box-shadow:0 22px 65px #000a;color:#f6f8fc;padding:18px}'+
   '#pdkAccountProfileModal .pdk-ap-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}'+
   '#pdkAccountProfileModal h2{margin:0;color:#ffd778;font-size:21px}'+
   '#pdkAccountProfileModal .pdk-ap-sub{margin:5px 0 0;color:#b8cadd;font-size:12px;line-height:1.5}'+
   '#pdkAccountProfileModal .pdk-ap-close{flex:0 0 40px;width:40px;height:40px;min-height:40px;padding:0;border-radius:12px;font-size:21px}'+
   '#pdkAccountProfileModal form{display:grid;gap:9px}'+
   '#pdkAccountProfileModal label{display:grid;gap:5px;margin:0;color:#cbd9e7;font-size:12px;font-weight:750}'+
   '#pdkAccountProfileModal input,#pdkAccountProfileModal select,#pdkAccountProfileModal textarea{width:100%;min-width:0;min-height:44px;box-sizing:border-box;padding:10px 12px;border:1px solid #365a79;border-radius:11px;background:#04172b;color:#f6f8fc;font:inherit;font-size:14px;outline:none}'+
   '#pdkAccountProfileModal textarea{min-height:76px;resize:vertical}'+
   '#pdkAccountProfileModal input:focus,#pdkAccountProfileModal select:focus,#pdkAccountProfileModal textarea:focus{border-color:#ffd778;box-shadow:0 0 0 3px #ffd77824}'+
   '#pdkAccountProfileModal .pdk-ap-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'+
   '#pdkAccountProfileModal .pdk-ap-readonly{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:11px;border:1px solid #31516d;border-radius:13px;background:#071d32}'+
   '#pdkAccountProfileModal .pdk-ap-readonly span{display:block;color:#9fb5ca;font-size:10px}'+
   '#pdkAccountProfileModal .pdk-ap-readonly strong{display:block;margin-top:3px;color:#ffe1a0;font-size:13px;overflow-wrap:anywhere}'+
   '#pdkAccountProfileModal .pdk-ap-actions{display:flex;gap:8px;margin-top:5px}'+
   '#pdkAccountProfileModal .pdk-ap-actions button{flex:1;min-height:46px;border-radius:12px}'+
   '#pdkAccountProfileModal .pdk-ap-save{background:linear-gradient(135deg,#ffe8a7,#e8ad43)!important;color:#11243a!important;border:1px solid #ffe9b0!important}'+
   '#pdkAccountProfileModal .pdk-ap-status{min-height:18px;color:#ffd778;font-size:12px;line-height:1.45;overflow-wrap:anywhere}'+
   '#pdkAccountProfileModal .pdk-ap-avatar{display:flex;align-items:center;gap:12px;padding:10px 0}'+
   '#pdkAccountProfileModal .pdk-ap-avatar img,#pdkAccountProfileModal .pdk-ap-avatar .pdk-ap-initial{width:58px;height:58px;flex:0 0 58px;border-radius:50%;object-fit:cover;border:2px solid #ffd778}'+
   '#pdkAccountProfileModal .pdk-ap-avatar .pdk-ap-initial{display:grid;place-items:center;background:#153b5b;color:#ffe1a0;font-size:24px;font-weight:900}'+
   '#pdkStaffDirectoryPanel{margin:14px 0 16px;padding:14px;border:1px solid rgba(244,202,112,.38);border-radius:17px;background:linear-gradient(145deg,#102b45,#081d33);color:#f6f8fc}'+
   '#pdkStaffDirectoryPanel h3{margin:0;color:#ffd778;font-size:17px}'+
   '#pdkStaffDirectoryPanel .pdk-sd-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}'+
   '#pdkStaffDirectoryPanel .pdk-sd-search{margin:10px 0 12px}'+
   '#pdkStaffDirectoryPanel .pdk-sd-search input{width:100%;min-height:42px;padding:9px 12px;border:1px solid #365a79;border-radius:11px;background:#04172b;color:#fff}'+
   '#pdkStaffDirectoryPanel .pdk-sd-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:9px}'+
   '#pdkStaffDirectoryPanel .pdk-sd-card{min-width:0;padding:11px;border:1px solid #2d5475;border-radius:13px;background:rgba(4,20,36,.72)}'+
   '#pdkStaffDirectoryPanel .pdk-sd-top{display:flex;align-items:center;gap:10px;min-width:0}'+
   '#pdkStaffDirectoryPanel .pdk-sd-top img,#pdkStaffDirectoryPanel .pdk-sd-avatar{width:48px;height:48px;flex:0 0 48px;border-radius:50%;object-fit:cover;border:2px solid #e9bd5f}'+
   '#pdkStaffDirectoryPanel .pdk-sd-avatar{display:grid;place-items:center;background:#173b5b;color:#ffe1a0;font-size:19px;font-weight:900}'+
   '#pdkStaffDirectoryPanel .pdk-sd-name{min-width:0;overflow-wrap:anywhere;font-weight:850;color:#f7f9fd}'+
   '#pdkStaffDirectoryPanel .pdk-sd-meta{color:#ffd778;font-size:11px;margin-top:3px}'+
   '#pdkStaffDirectoryPanel .pdk-sd-details{display:grid;gap:4px;margin-top:9px;padding-top:8px;border-top:1px solid #294966;color:#c7d6e3;font-size:11px;line-height:1.4;overflow-wrap:anywhere}'+
   '#pdkStaffDirectoryPanel .pdk-sd-details a{color:#ffe1a0}'+
   '#pdkStaffDirectoryPanel .pdk-sd-edit{width:100%;min-height:39px;margin-top:9px;border:1px solid #d6b45c;border-radius:10px;background:#173b5b;color:#fff;font-weight:800}'+
   '@media(max-width:420px){#pdkAccountProfileModal .pdk-ap-card{padding:14px;border-radius:17px}#pdkAccountProfileModal .pdk-ap-grid{grid-template-columns:1fr}#pdkStaffDirectoryPanel{padding:11px}}';
  document.head.appendChild(style);
 }
 function ensureModal(){
  if($('pdkAccountProfileModal'))return;
  const modal=document.createElement('div');modal.id='pdkAccountProfileModal';modal.setAttribute('aria-hidden','true');
  const platformHtml=platformOptions.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  modal.innerHTML='<section class="pdk-ap-card" role="dialog" aria-modal="true" aria-labelledby="pdkAccountProfileTitle">'+
   '<div class="pdk-ap-head"><div><h2 id="pdkAccountProfileTitle">👤 My Profile</h2><p class="pdk-ap-sub" id="pdkAccountProfileSubtitle">Personal and contact information</p></div><button type="button" class="pdk-ap-close" id="pdkAccountProfileClose" aria-label="Close">×</button></div>'+
   '<div class="pdk-ap-avatar" id="pdkAccountProfileAvatar"></div>'+
   '<form id="pdkAccountProfileForm">'+
   '<div class="pdk-ap-readonly" id="pdkAccountProfileStaffMeta" hidden><div><span>Staff ID</span><strong id="pdkAccountProfileStaffId">—</strong></div><div><span>Department</span><strong id="pdkAccountProfileDepartment">—</strong></div></div>'+
   '<label for="pdkAccountProfileName"><span id="pdkAccountProfileNameLabel">Full name / အမည်</span><input id="pdkAccountProfileName" maxlength="80" autocomplete="name" required></label>'+
   '<div class="pdk-ap-grid"><label for="pdkAccountProfileBirth">🎂 Date of birth / မွေးနေ့<input id="pdkAccountProfileBirth" type="date"></label><label for="pdkAccountProfilePhone">☎ Phone / ဖုန်း<input id="pdkAccountProfilePhone" type="tel" maxlength="40" autocomplete="tel" placeholder="+66 ..."></label></div>'+
   '<div class="pdk-ap-grid"><label for="pdkAccountProfilePlatform">Social platform<select id="pdkAccountProfilePlatform"><option value="">Select platform</option>'+platformHtml+'</select></label><label for="pdkAccountProfileSocial">Social profile link<input id="pdkAccountProfileSocial" type="url" maxlength="500" placeholder="https://..."></label></div>'+
   '<label id="pdkAccountProfileNotesWrap" for="pdkAccountProfileNotes" hidden>Additional information / မှတ်ချက်<textarea id="pdkAccountProfileNotes" maxlength="500" placeholder="Optional details"></textarea></label>'+
   '<div class="pdk-ap-status" id="pdkAccountProfileStatus" role="status" aria-live="polite"></div>'+
   '<div class="pdk-ap-actions"><button type="button" id="pdkAccountProfileCancel">Cancel</button><button type="submit" class="pdk-ap-save" id="pdkAccountProfileSave">Save Profile</button></div></form></section>';
  document.body.appendChild(modal);
  const close=()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true')};
  $('pdkAccountProfileClose').onclick=close;$('pdkAccountProfileCancel').onclick=close;
  modal.addEventListener('click',e=>{if(e.target===modal)close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close()});
  $('pdkAccountProfileForm').addEventListener('submit',saveProfile);
 }
 function ensureNavButton(){
  const nav=$('nav');if(!nav||!activeProfile)return;
  let button=$('pdkMyProfileButton');
  if(button&&button.parentElement!==nav)button.remove();
  if(!button){button=document.createElement('button');button.id='pdkMyProfileButton';button.type='button';button.textContent='👤 My Profile · ကိုယ်ရေးအချက်အလက်';button.onclick=openProfile}
  if(button.parentElement!==nav)nav.insertBefore(button,nav.firstChild);
 }
 async function readProfile(session){
  const client=window.sb;if(!client||!session?.user?.id)return null;
  const {data,error}=await client.from('profiles').select('id,display_name,role,avatar_url,staff_id,is_archived,birth_date,phone,social_platform,social_link').eq('id',session.user.id).maybeSingle();
  if(error)throw error;
  if(!data||data.is_archived||!['owner','staff'].includes(data.role))return null;
  return data;
 }
 async function syncSession(session){
  try{
   activeUser=session?.user||null;
   activeProfile=await readProfile(session);
   if(activeProfile){addStyles();ensureModal();ensureNavButton()}
   else{$('pdkMyProfileButton')?.remove()}
  }catch(error){console.warn('Account profile could not be initialized:',error?.message||error)}
 }
 async function openProfile(){
  if(!activeUser||!activeProfile)return;
  const modal=$('pdkAccountProfileModal');if(!modal)return;
  const client=window.sb,isStaff=activeProfile.role==='staff';
  $('pdkAccountProfileStatus').textContent='Loading saved profile…';
  $('pdkAccountProfileTitle').textContent=isStaff?'👤 Staff Profile':'👤 Owner Profile';
  $('pdkAccountProfileSubtitle').textContent=isStaff?'Your details are visible to Owner in Staff Directory.':'Your Owner contact details and name used in Team Chat.';
  $('pdkAccountProfileNameLabel').textContent=isStaff?'Staff name / ဝန်ထမ်းအမည်':'Owner name / Owner အမည်';
  $('pdkAccountProfileNotesWrap').hidden=!isStaff;$('pdkAccountProfileStaffMeta').hidden=!isStaff;
  $('pdkAccountProfileBirth').max=new Date().toISOString().slice(0,10);
  try{
   let values={display_name:activeProfile.display_name||'',birth_date:activeProfile.birth_date||'',phone:activeProfile.phone||'',social_platform:activeProfile.social_platform||'',social_link:activeProfile.social_link||'',notes:''};
   if(isStaff){
    if(!activeProfile.staff_id)throw new Error('Your Staff ID is not linked yet. Please contact Owner.');
    const [detailRes,directoryRes]=await Promise.all([
     client.from('staff_profile_details').select('staff_id,display_name,birth_date,phone,social_platform,social_link,notes').eq('staff_id',activeProfile.staff_id).maybeSingle(),
     client.from('staff_directory').select('department,birth_date,display_name,phone,social_platform,social_link,notes').eq('staff_id',activeProfile.staff_id).maybeSingle()
    ]);
    if(detailRes.error)throw detailRes.error;if(directoryRes.error)throw directoryRes.error;
    const source=detailRes.data||directoryRes.data||{};
    values={...values,display_name:source.display_name||values.display_name,birth_date:source.birth_date||values.birth_date,phone:source.phone||'',social_platform:source.social_platform||'',social_link:source.social_link||'',notes:source.notes||''};
    $('pdkAccountProfileStaffId').textContent=activeProfile.staff_id;
    $('pdkAccountProfileDepartment').textContent=deptNames[directoryRes.data?.department]||directoryRes.data?.department||'Not assigned';
   }
   $('pdkAccountProfileName').value=values.display_name;
   $('pdkAccountProfileBirth').value=String(values.birth_date||'').slice(0,10);
   $('pdkAccountProfilePhone').value=values.phone;
   $('pdkAccountProfilePlatform').value=values.social_platform;
   $('pdkAccountProfileSocial').value=values.social_link;
   $('pdkAccountProfileNotes').value=values.notes;
   const avatar=activeProfile.avatar_url;
   $('pdkAccountProfileAvatar').innerHTML=avatar?'<img src="'+esc(avatar)+'" alt="Profile photo"><div><strong>'+esc(values.display_name||'')+'</strong><div class="pdk-ap-sub">Profile photo managed in existing Staff Profile settings</div></div>':'<div class="pdk-ap-initial">'+esc((values.display_name||'S').slice(0,1).toUpperCase())+'</div><div><strong>'+esc(values.display_name||'')+'</strong><div class="pdk-ap-sub">Profile information</div></div>';
   $('pdkAccountProfileStatus').textContent='';modal.classList.add('open');modal.setAttribute('aria-hidden','false');
  }catch(error){$('pdkAccountProfileStatus').textContent='Could not load profile: '+(error.message||error);modal.classList.add('open');modal.setAttribute('aria-hidden','false')}
 }
 async function saveProfile(event){
  event.preventDefault();if(modalBusy)return;modalBusy=true;
  const btn=$('pdkAccountProfileSave'),status=$('pdkAccountProfileStatus');
  btn.disabled=true;btn.textContent='Saving…';status.textContent='Saving profile details securely…';
  try{
   const client=window.sb,name=$('pdkAccountProfileName').value.trim();
   const birth=$('pdkAccountProfileBirth').value||null,phone=$('pdkAccountProfilePhone').value.trim()||null;
   const platform=$('pdkAccountProfilePlatform').value||null,social=$('pdkAccountProfileSocial').value.trim()||null;
   const notes=$('pdkAccountProfileNotes').value.trim()||null;
   if(!name||name.length>80)throw new Error('Please enter a name (1–80 characters).');
   if(birth&&birth>new Date().toISOString().slice(0,10))throw new Error('Date of birth cannot be in the future.');
   if(phone&&phone.length>40)throw new Error('Phone number must be 40 characters or fewer.');
   if(social&&(!/^https?:\/\//i.test(social)||social.length>500))throw new Error('Enter a valid social profile link beginning with https:// or http://.');
   if(activeProfile.role==='owner'){
    const {data,error}=await client.from('profiles').update({display_name:name,birth_date:birth,phone,social_platform:platform,social_link:social}).eq('id',activeUser.id).eq('role','owner').select('id,display_name,role,avatar_url,staff_id,is_archived,birth_date,phone,social_platform,social_link').maybeSingle();
    if(error)throw error;if(!data)throw new Error('Owner profile was not updated. Check Owner account permissions.');
    activeProfile=data;
   }else{
    const {data,error}=await client.from('staff_profile_details').upsert({staff_id:activeProfile.staff_id,display_name:name,birth_date:birth,phone,social_platform:platform,social_link:social,notes},{onConflict:'staff_id'}).select('staff_id,display_name,birth_date,phone,social_platform,social_link,notes').maybeSingle();
    if(error)throw error;if(!data)throw new Error('Staff profile was not saved. Please retry.');
    activeProfile.display_name=data.display_name;
   }
   try{await client.auth.updateUser({data:{display_name:name}})}catch(metaError){console.warn('Auth display metadata sync skipped:',metaError?.message||metaError)}
   status.textContent='✓ Profile saved. Team Chat and staff identity names will update automatically.';
   if(window.pdkRefreshStaffDirectory)window.pdkRefreshStaffDirectory();
   setTimeout(()=>{const modal=$('pdkAccountProfileModal');if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}},650);
  }catch(error){status.textContent='Could not save profile: '+(error.message||error)}
  finally{modalBusy=false;btn.disabled=false;btn.textContent='Save Profile'}
 }
 async function loadStaffDirectory(){
  const client=window.sb,root=$('pageContent');
  if(!client||!root||root.dataset.uiPage!=='staff'||activeProfile?.role!=='owner')return;
  let panel=$('pdkStaffDirectoryPanel');
  if(!panel){
   panel=document.createElement('section');panel.id='pdkStaffDirectoryPanel';
   panel.innerHTML='<div class="pdk-sd-head"><div><h3>👥 Staff Directory · ဝန်ထမ်းစာရင်း</h3><div class="pdk-ap-sub">Staff names, birthdays, departments and contact details</div></div><button type="button" id="pdkStaffDirectoryRefresh" style="min-height:38px;padding:7px 10px;border-radius:10px">↻ Refresh</button></div><div class="pdk-sd-search"><input id="pdkStaffDirectorySearch" type="search" placeholder="Search name, Staff ID, department or phone…" aria-label="Search Staff Directory"></div><div id="pdkStaffDirectoryList" class="pdk-sd-list">Loading Staff Directory…</div>';
   const activity=$('normalStaffActivitySection');
   if(activity&&activity.parentElement)activity.parentElement.insertBefore(panel,activity);else root.appendChild(panel);
   $('pdkStaffDirectoryRefresh').onclick=()=>loadStaffDirectory();
   $('pdkStaffDirectorySearch').addEventListener('input',renderDirectoryCards);
  }
  try{
   const [dRes,pRes,aRes]=await Promise.all([
    client.from('staff_directory').select('staff_id,display_name,department,birth_date,phone,social_platform,social_link,notes').order('staff_id',{ascending:true}),
    client.from('staff_profile_details').select('staff_id,display_name,birth_date,phone,social_platform,social_link,notes'),
    client.from('profiles').select('id,display_name,avatar_url,role,staff_id,is_archived,created_at').eq('role','staff')
   ]);
   if(dRes.error)throw dRes.error;if(pRes.error)throw pRes.error;if(aRes.error)throw aRes.error;
   const detailsById=new Map((pRes.data||[]).map(x=>[String(x.staff_id||'').toUpperCase(),x]));
   const profilesById=new Map();
   for(const p of (aRes.data||[]).filter(x=>!x.is_archived).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))){
    const key=String(p.staff_id||'').toUpperCase();if(key&&!profilesById.has(key))profilesById.set(key,p);
   }
   window.__pdkStaffDirectoryRows=(dRes.data||[]).map(d=>({directory:d,details:detailsById.get(String(d.staff_id).toUpperCase())||{},profile:profilesById.get(String(d.staff_id).toUpperCase())||null}));
   renderDirectoryCards();
  }catch(error){const list=$('pdkStaffDirectoryList');if(list)list.textContent='Could not load Staff Directory: '+(error.message||error)}
 }
 function renderDirectoryCards(){
  const list=$('pdkStaffDirectoryList');if(!list)return;
  const query=String($('pdkStaffDirectorySearch')?.value||'').trim().toLocaleLowerCase();
  const rows=window.__pdkStaffDirectoryRows||[];
  const filtered=rows.filter(({directory:d,details:x})=>[d.staff_id,d.display_name,d.department,x.display_name,x.phone||d.phone,x.social_platform||d.social_platform].join(' ').toLocaleLowerCase().includes(query));
  if(!filtered.length){list.innerHTML='<div class="pdk-ap-sub" style="padding:14px">No matching Staff records found.</div>';return}
  list.innerHTML=filtered.map(({directory:d,details:x,profile:p})=>{
   const name=x.display_name||d.display_name||'Staff',dept=deptNames[d.department]||d.department||'Not assigned';
   const birth=x.birth_date||d.birth_date||'',phone=x.phone||d.phone||'',platform=x.social_platform||d.social_platform||'',social=x.social_link||d.social_link||'',notes=x.notes||d.notes||'';
   const avatar=p?.avatar_url?'<img src="'+esc(p.avatar_url)+'" alt="'+esc(name)+' profile photo">':'<div class="pdk-sd-avatar">'+esc(name.slice(0,1).toUpperCase())+'</div>';
   const socialHtml=social?'<a href="'+esc(social)+'" target="_blank" rel="noopener noreferrer">'+esc(platform||'Social profile')+'</a>':'—';
   const phoneHtml=phone?'<a href="tel:'+esc(phone)+'">'+esc(phone)+'</a>':'—';
   return '<article class="pdk-sd-card"><div class="pdk-sd-top">'+avatar+'<div style="min-width:0"><div class="pdk-sd-name">'+esc(name)+'</div><div class="pdk-sd-meta">'+esc(d.staff_id)+' · '+esc(dept)+'</div></div></div><div class="pdk-sd-details"><div>🎂 Birthday: '+esc(birth||'—')+'</div><div>☎ Phone: '+phoneHtml+'</div><div>🌐 '+socialHtml+'</div>'+(notes?'<div>📝 '+esc(notes)+'</div>':'')+'</div><button type="button" class="pdk-sd-edit" data-staff-id="'+esc(d.staff_id)+'" '+(p?'':'disabled')+'>'+(p?'✎ Edit Staff Profile':'No linked Staff account yet')+'</button></article>';
  }).join('');
  list.querySelectorAll('.pdk-sd-edit').forEach(btn=>btn.onclick=()=>{
   const item=rows.find(x=>String(x.directory.staff_id).toUpperCase()===String(btn.dataset.staffId).toUpperCase());
   if(!item||!item.profile||typeof window.openStaffProfileEdit!=='function')return;
   const d=item.directory,p=item.profile;
   window.openStaffProfileEdit({user_id:p.id,display_name:item.details.display_name||d.display_name,staff_id:d.staff_id,department:d.department,normalized_name:d.staff_id},p);
  });
 }
 function observePages(){
  const root=$('pageContent');if(!root||pageObserver)return;
  pageObserver=new MutationObserver(()=>{
   if(activeProfile?.role==='owner'&&root.dataset.uiPage==='staff')loadStaffDirectory();
   else $('pdkStaffDirectoryPanel')?.remove();
  });
  pageObserver.observe(root,{childList:true,subtree:false,attributes:true,attributeFilter:['data-ui-page']});
  if(activeProfile?.role==='owner'&&root.dataset.uiPage==='staff')loadStaffDirectory();
 }
 function init(){
  const client=window.sb;if(!client)return;
  if(!authSubscription){
   const {data}=client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>syncSession(session),0)});
   authSubscription=data?.subscription||null;
  }
  client.auth.getSession().then(({data,error})=>{if(!error)syncSession(data.session)}).catch(e=>console.warn('Account profile session check failed:',e));
  const nav=$('nav');
  if(nav&&!navObserver){navObserver=new MutationObserver(ensureNavButton);navObserver.observe(nav,{childList:true,subtree:true})}
  observePages();
  if(!directoryTimer)directoryTimer=setInterval(()=>{if(activeProfile?.role==='owner'&&$('pageContent')?.dataset.uiPage==='staff')loadStaffDirectory()},30000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 setInterval(()=>{if(window.sb&&!activeProfile)init()},2000);
})();