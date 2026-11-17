/* Per-account Phone / Laptop UI mode for Owner and Staff */
(function(){
 'use strict';
 const body=document.body;
 const role=()=>((typeof currentRole!=='undefined'&&currentRole==='owner')?'owner':((typeof STAFF_MODE!=='undefined'&&STAFF_MODE)?'staff':'owner'));
 const userId=()=>typeof currentUser!=='undefined'&&currentUser&&currentUser.id?String(currentUser.id):'device';
 const key=()=> 'tctl-ui-mode-v1:'+role()+':'+userId();
 let mode='auto',loadedFor='';
 function load(){loadedFor=key();try{mode=localStorage.getItem(loadedFor)||'auto'}catch(e){mode='auto'}apply()}
 function apply(){
  body.classList.remove('ui-mode-phone','ui-mode-laptop','ui-mode-auto');
  body.classList.add('ui-mode-'+mode);
  body.dataset.uiMode=mode;
  const badge=document.getElementById('uiModeCurrent');if(badge)badge.textContent=mode==='phone'?'📱 Phone UI':mode==='laptop'?'💻 Laptop UI':'Auto';
 }
 function save(next){
  if(!['phone','laptop','auto'].includes(next))return;
  mode=next;try{localStorage.setItem(key(),mode)}catch(e){}
  apply();renderControls();
 }
 function renderControls(){
  if(loadedFor!==key())load();
  const root=document.getElementById('pageContent');
  if(!root||root.dataset.uiPage!=='settings')return;
  let panel=document.getElementById('deviceUiModePanel');
  if(!panel){
   panel=document.createElement('section');panel.id='deviceUiModePanel';panel.className='panel ui-mode-settings';
   panel.innerHTML='<h3>📐 Device UI / မျက်နှာပြင်ပုံစံ</h3><p class="subtle">Choose a layout for this account on this device. Owner and Staff preferences are stored separately.</p><div class="ui-mode-options"><button type="button" data-ui-mode="phone" class="ui-mode-choice">📱 UI<br><small>Phone UI</small></button><button type="button" data-ui-mode="laptop" class="ui-mode-choice">💻 UI<br><small>Laptop UI</small></button><button type="button" data-ui-mode="auto" class="ui-mode-choice">↔ Auto<br><small>Device default</small></button></div><p class="subtle" aria-live="polite">Current: <b id="uiModeCurrent"></b></p>';
   const heading=root.querySelector('.panel');if(heading)heading.appendChild(panel);else root.prepend(panel);
   panel.querySelectorAll('[data-ui-mode]').forEach(btn=>btn.addEventListener('click',()=>save(btn.dataset.uiMode)));
  }
  panel.querySelectorAll('[data-ui-mode]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.uiMode===mode));
  const badge=document.getElementById('uiModeCurrent');if(badge)badge.textContent=mode==='phone'?'📱 Phone UI':mode==='laptop'?'💻 Laptop UI':'Auto';
 }
 const style=document.createElement('style');
 style.textContent=`
 .ui-mode-settings{border:1px solid rgba(225,184,91,.55)!important}
 .ui-mode-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
 .ui-mode-choice{min-height:72px;border:1px solid rgba(210,174,91,.45);border-radius:13px;background:rgba(15,43,66,.8);color:inherit;font-weight:800;padding:10px;cursor:pointer}
 .ui-mode-choice small{font-weight:500;opacity:.8}
 .ui-mode-choice.selected{outline:2px solid #e8bd62;background:rgba(145,103,31,.24)}
 body.ui-mode-phone #pageContent{width:100%;max-width:600px;margin-inline:auto}
 body.ui-mode-phone #pageContent .panel{min-width:0;max-width:100%;overflow-wrap:anywhere}
 body.ui-mode-phone #pageContent table{display:block;max-width:100%;overflow-x:auto}
 body.ui-mode-phone #pageContent .cards,body.ui-mode-phone #pageContent .grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 body.ui-mode-phone #pageContent button,body.ui-mode-phone #pageContent input,body.ui-mode-phone #pageContent select{max-width:100%}
 body.ui-mode-laptop #pageContent{width:100%;max-width:none;margin-inline:0}
 body.ui-mode-laptop #pageContent .cards,body.ui-mode-laptop #pageContent .grid{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
 body.ui-mode-laptop #pageContent table{width:100%}
 body.ui-mode-laptop #pageContent .panel{min-width:0}
 @media(max-width:700px){body.ui-mode-laptop #pageContent{min-width:760px}body.ui-mode-laptop #pageContent{overflow-x:auto}}
 @media(max-width:700px){.ui-mode-options{grid-template-columns:1fr}}
 `;
 document.head.appendChild(style);
 window.renderDeviceUiModeControls=function(root){
  try{
   if(!root)return;
   if(loadedFor!==key())load();
   let panel=root.querySelector('#deviceUiModePanel');
   if(!panel){
    panel=document.createElement('section');panel.id='deviceUiModePanel';panel.className='panel ui-mode-settings';
    panel.innerHTML='<h3>📐 Device UI / မျက်နှာပြင်ပုံစံ</h3><p class="subtle">Choose a layout for this account on this device. Owner and Staff preferences are stored separately.</p><div class="ui-mode-options"><button type="button" data-ui-mode="phone" class="ui-mode-choice">📱 UI<br><small>Phone UI</small></button><button type="button" data-ui-mode="laptop" class="ui-mode-choice">💻 UI<br><small>Laptop UI</small></button><button type="button" data-ui-mode="auto" class="ui-mode-choice">↔ Auto<br><small>Device default</small></button></div><p class="subtle" aria-live="polite">Current: <b id="uiModeCurrent"></b></p>';
    root.appendChild(panel);
    panel.addEventListener('click',function(event){const button=event.target.closest('[data-ui-mode]');if(button&&panel.contains(button)){event.preventDefault();save(button.dataset.uiMode)}});
   }
   panel.querySelectorAll('[data-ui-mode]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.uiMode===mode));
   const badge=panel.querySelector('#uiModeCurrent');if(badge)badge.textContent=mode==='phone'?'📱 Phone UI':mode==='laptop'?'💻 Laptop UI':'Auto';
  }catch(error){console.error('Device UI controls could not render:',error)}
 };
 load();
 window.addEventListener('storage',e=>{if(e.key===key()){mode=e.newValue||'auto';apply();renderControls()}});
})();
