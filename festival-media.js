/* Pattaya Dinosaur Kingdom — annual festival calendar + private festival video manager.
 * Additive module. Existing authentication, ticketing and sales code is not modified.
 */
(function () {
  'use strict';

  const BUCKET = 'festival-videos';
  const MAX_BYTES = 50 * 1024 * 1024;
  const TZ = 'Asia/Bangkok';
  const signedUrlCache = new Map();
  let mediaRows = [];
  let seed2027 = [];
  let lastCalendarYear = null;
  let lastMediaFetch = 0;
  let busy = false;

  const t = (en, my) => (typeof lang !== 'undefined' && lang === 'my' ? my : en);
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const bangkokParts = date => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(date || new Date());
    const get = k => parts.find(p => p.type === k)?.value || '';
    return { year:Number(get('year')), month:Number(get('month')), day:Number(get('day')),
      key:get('year')+'-'+get('month')+'-'+get('day') };
  };
  const today = () => bangkokParts(new Date());
  const makeEvent = (date,title,desc,kind,theme,icon,status) =>
    ({date,title,desc,kind,theme,icon,status});

  function recurringEvents(year) {
    const events = [
      makeEvent(year+'-01-01',"New Year's Day",'Thailand public holiday and the first day of the calendar year.','holiday','new-year','🎆','official'),
      makeEvent(year+'-01-16',"Thailand Teachers' Day",'A day to honour teachers and the teaching profession.','cultural','national','📚','cultural'),
      makeEvent(year+'-02-14',"Valentine's Day",'A popular cultural celebration.','cultural','valentines','❤️','cultural'),
      makeEvent(year+'-04-06','Chakri Memorial Day','Thailand national public holiday.','holiday','royal','👑','official'),
      makeEvent(year+'-04-13','Songkran Festival · Day 1','Thai New Year water festival.','festival','songkran','💦','official'),
      makeEvent(year+'-04-14','Songkran Festival · Day 2','Songkran family and water celebrations.','festival','songkran','💦','official'),
      makeEvent(year+'-04-15','Songkran Festival · Day 3','The third main day of Songkran.','festival','songkran','💦','official'),
      makeEvent(year+'-05-01','National Labour Day','A day recognising workers.','holiday','national','⚒️','cultural'),
      makeEvent(year+'-05-04','Coronation Day','Thailand national public holiday.','holiday','royal','👑','official'),
      makeEvent(year+'-06-03',"H.M. Queen Suthida's Birthday",'Thailand national public holiday.','holiday','royal','💜','official'),
      makeEvent(year+'-07-28',"H.M. King Maha Vajiralongkorn's Birthday",'Thailand national public holiday.','holiday','royal','👑','official'),
      makeEvent(year+'-08-12',"Queen Sirikit The Queen Mother's Birthday · Mother's Day",'Thailand national public holiday and National Mother’s Day.','holiday','royal','💙','official'),
      makeEvent(year+'-10-13','King Bhumibol Adulyadej The Great Memorial Day','Thailand national remembrance day.','holiday','royal','🕯️','official'),
      makeEvent(year+'-10-23','King Chulalongkorn Memorial Day','Thailand national remembrance day.','holiday','royal','👑','cultural'),
      makeEvent(year+'-12-05',"King Bhumibol's Birthday · National Day · Father's Day",'Thailand National Day and Father’s Day.','holiday','royal','💛','official'),
      makeEvent(year+'-12-10','Constitution Day','Thailand national public holiday.','holiday','national','📜','official'),
      makeEvent(year+'-12-25','Christmas Day','Christmas celebration. Upload a video to show it automatically on this date.','festival','christmas','🎄','cultural'),
      makeEvent(year+'-12-31',"New Year's Eve",'Year-end countdown and celebrations.','festival','new-year','🎆','cultural')
    ];
    const jan1 = new Date(Date.UTC(year,0,1));
    const firstSaturday = 1 + ((6 - jan1.getUTCDay() + 7) % 7);
    const childrenDay = firstSaturday + 7;
    events.push(makeEvent(year+'-01-'+String(childrenDay).padStart(2,'0'),"Thailand National Children's Day",'Observed on the second Saturday of January.','cultural','children','🦖','cultural'));
    // Movable lunar observances are estimates for future years, not official confirmations.
    // The 2027 list above uses the published 2027 dates; later years are marked expected.
    const lunarShift = Math.round((year - 2027) * 354.367);
    const shifted = base => {
      const d = new Date(base+'T00:00:00Z');
      d.setUTCDate(d.getUTCDate()+lunarShift);
      return d.toISOString().slice(0,10);
    };
    [
      [shifted('2027-02-21'),'Makha Bucha Day','Buddhist holy day · expected lunar date','religious','buddhist','🪷'],
      [shifted('2027-05-20'),'Visakha Bucha Day','Buddhist holy day · expected lunar date','religious','buddhist','🪷'],
      [shifted('2027-07-18'),'Asarnha Bucha Day','Buddhist holy day · expected lunar date','religious','buddhist','🪷'],
      [shifted('2027-07-19'),'Khao Phansa · Buddhist Lent begins','Buddhist Lent begins · expected lunar date','festival','buddhist','🕯️'],
      [shifted('2027-10-15'),'Ok Phansa','End of Buddhist Lent · expected lunar date','festival','buddhist','🪷'],
      [shifted('2027-11-13'),'Loy Krathong Festival','Festival of lights and floating krathongs · expected lunar date','festival','loy','🪷'],
      [shifted('2027-10-15'),'Thadingyut Festival','Myanmar lighting festival · expected lunar date','festival','buddhist','🪔'],
      [shifted('2027-11-12'),'Tazaungdaing Festival','Myanmar Festival of Lights · expected lunar date','festival','buddhist','🏮'],
      [shifted('2027-02-06'),'Chinese New Year','Lunar New Year · expected date','cultural','chinese','🧧']
    ].forEach(([date,title,desc,kind,theme,icon]) => events.push(makeEvent(date,title,desc,kind,theme,icon,'expected')));
    return events;
  }

  function eventsForYear(year) {
    if (year === 2027 && seed2027.length) {
      const list = seed2027.map(e => ({...e}));
      if (!list.some(e => e.date === '2027-12-25')) {
        list.push(makeEvent('2027-12-25','Christmas Day','Christmas celebration.','festival','christmas','🎄','cultural'));
      }
      if (!list.some(e => e.title === 'Thadingyut Festival')) {
        list.push(makeEvent('2027-10-15','Thadingyut Festival · Expected','Myanmar lighting festival; date is an indicative cultural-calendar date and should be confirmed locally.','festival','buddhist','🪔','expected'));
      }
      if (!list.some(e => e.title === 'Tazaungdaing Festival')) {
        list.push(makeEvent('2027-11-12','Tazaungdaing Festival · Expected','Myanmar Festival of Lights; date is indicative and should be confirmed locally.','festival','buddhist','🏮','expected'));
      }
      return list;
    }
    if (year === 2026) {
      return [
        makeEvent('2026-11-24','Loy Krathong Festival','The full-moon festival of lights and floating krathongs.','festival','loy','🪷','cultural'),
        makeEvent('2026-11-24','Tazaungdaing Festival','Myanmar Festival of Lights; local observance date should be confirmed.','festival','buddhist','🏮','expected'),
        makeEvent('2026-12-05',"King Bhumibol's Birthday · National Day · Father's Day",'Thailand national day.','holiday','royal','💛','official'),
        makeEvent('2026-12-07','Substitution for 5 December Holiday','Substitute holiday.','holiday','royal','💛','official'),
        makeEvent('2026-12-10','Constitution Day','Thailand national public holiday.','holiday','national','📜','official'),
        makeEvent('2026-12-25','Christmas Day','Christmas celebration.','festival','christmas','🎄','cultural'),
        makeEvent('2026-12-31',"New Year's Eve",'Year-end countdown and celebrations.','festival','new-year','🎆','cultural')
      ].filter(e => e.date);
    }
    return recurringEvents(year);
  }

  function currentEvents() {
    const p = today();
    return eventsForYear(p.year).sort((a,b) => a.date.localeCompare(b.date));
  }

  function monthLabel(year, month) {
    return new Intl.DateTimeFormat(typeof lang !== 'undefined' && lang === 'th' ? 'th-TH' : 'en-US',
      {month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month,1)));
  }
  function dateLabel(key) {
    return new Intl.DateTimeFormat(typeof lang !== 'undefined' && lang === 'th' ? 'th-TH' : 'en-US',
      {weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T00:00:00Z'));
  }

  function setGlobalEvents(events) {
    window.__pdkThailandFestivalEvents = events;
    window.__pdkThailandFestivalLookup = events.reduce((map,e) => {
      (map[e.date] || (map[e.date] = [])).push(e); return map;
    }, {});
  }

  async function fetchMedia(force) {
    if (!currentUser || !sb) return [];
    if (!force && Date.now() - lastMediaFetch < 30000) return mediaRows;
    const {data,error} = await sb.from('festival_media')
      .select('id,festival_date,festival_name,festival_kind,festival_theme,display_time,blob_path,content_type,file_size_bytes')
      .order('festival_date',{ascending:true});
    if (error) throw error;
    mediaRows = data || [];
    lastMediaFetch = Date.now();
    return mediaRows;
  }

  async function signedUrl(path) {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expires > Date.now()) return cached.url;
    const {data,error} = await sb.storage.from(BUCKET).createSignedUrl(path,60);
    if (error) throw error;
    signedUrlCache.set(path,{url:data.signedUrl,expires:Date.now()+45000});
    return data.signedUrl;
  }

  function activeDateAndTitle() {
    const preview = window.__pdkFestivalDateTimePreview;
    if (preview && preview.date) return {date:preview.date,title:preview.title || ''};
    const p = today();
    const dayEvents = (window.__pdkThailandFestivalLookup || {})[p.key] || [];
    return {date:p.key,title:dayEvents[0]?.title || ''};
  }

  async function syncDateTimeVideo(force) {
    const card = document.getElementById('appDateTime');
    if (!card || !currentUser) return;
    const selected = activeDateAndTitle();
    try {
      const rows = await fetchMedia(!!force);
      let row = selected.title
        ? rows.find(x => x.festival_date === selected.date && x.festival_name === selected.title)
        : null;
      if (!row) row = rows.find(x => x.festival_date === selected.date);
      const video = card.querySelector('.pdk-festival-video');
      if (!video) return;
      const scene = card.querySelector('.pdk-festival-scene');
      if (!row) {
        if (video.dataset.festivalManaged === '1') {
          video.pause();
          video.removeAttribute('src');
          video.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
          video.load();
          delete video.dataset.festivalManaged;
          if (scene) scene.style.display = '';
          card.classList.remove('has-owner-festival-video');
        }
        return;
      }
      const url = await signedUrl(row.blob_path);
      const holidayLabel=document.getElementById('appHolidayValue');
      if(holidayLabel){holidayLabel.textContent=row.festival_name;holidayLabel.hidden=false;holidayLabel.classList.add('is-special');holidayLabel.classList.remove('is-holiday');}
      const source = video.querySelector('source');
      const current = source?.getAttribute('src') || video.getAttribute('src') || '';
      if (current !== url) {
        video.pause();
        if (source) source.src = url; else video.src = url;
        video.dataset.festivalManaged = '1';
        video.dataset.festivalMediaId = row.id;
        video.setAttribute('preload','auto');
        video.setAttribute('muted','');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.load();
        const play = video.play();
        if (play && play.catch) play.catch(() => {});
      }
      if (scene) scene.style.display = 'none';
      card.classList.add('has-owner-festival-video');
    } catch (error) {
      console.warn('Festival video sync failed:',error);
    }
  }

  function renderCalendar() {
    const root = document.getElementById('pageContent');
    if (!root) return;
    root.dataset.uiPage = 'festivals';
    if (!currentUser || currentRole !== 'owner') {
      root.innerHTML = '<section class="panel"><h2>🎉 Thailand Festival Calendar</h2><p>Owner access only.</p></section>';
      return;
    }
    const p = today();
    const year = p.year;
    const all = currentEvents();
    setGlobalEvents(all);
    const firstMonth = year === p.year ? p.month - 1 : 0;
    const months = Array.from({length:12-firstMonth},(_,i)=>firstMonth+i);
    const eventMap = all.reduce((m,e)=>{(m[e.date]||(m[e.date]=[])).push(e);return m;},{});
    const monthHtml = months.map(month => {
      const firstDay = new Date(Date.UTC(year,month,1)).getUTCDay();
      const offset = (firstDay + 6) % 7;
      const days = new Date(Date.UTC(year,month+1,0)).getUTCDate();
      let cells = '';
      for (let i=0;i<offset;i++) cells += '<span class="pdk-fc-empty"></span>';
      for (let d=1;d<=days;d++) {
        const key = year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
        const ev = eventMap[key] || [];
        const dow = new Date(Date.UTC(year,month,d)).getUTCDay();
        const cls = ['pdk-fc-day',dow===0||dow===6?'is-weekend':'',ev.length?'has-event':'',
          ev.some(x=>x.status==='official')?'is-official':'',
          ev.some(x=>x.status==='expected')&&!ev.some(x=>x.status==='official')?'is-expected':'',
          key===p.key?'is-today':''].filter(Boolean).join(' ');
        cells += '<button type="button" class="'+cls+'" data-pdk-fc-date="'+key+'" aria-label="'+escapeHtml(key+' '+ev.map(x=>x.title).join(', '))+'">'+d+(ev.length?'<i class="pdk-fc-mark"></i>':'')+'</button>';
      }
      const count = all.filter(e=>Number(e.date.slice(5,7))===month+1).length;
      return '<section class="pdk-fc-month"><h3>'+escapeHtml(monthLabel(year,month))+' <small>'+count+' '+t('dates','ရက်')+'</small></h3><div class="pdk-fc-week">'+['M','T','W','T','F','S','S'].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="pdk-fc-days">'+cells+'</div></section>';
    }).join('');
    const upcoming = all.filter(e=>e.date>=p.key).slice(0,8);
    root.innerHTML = '<div class="pdk-festival-calendar"><section class="panel"><div class="pdk-fc-head"><div><h2>🎉 '+t('Thailand Festival Calendar','ထိုင်းနိုင်ငံ၏ နေ့ထူးနေ့မြတ် ပြက္ခဒိန်')+'</h2><p>'+t('From this month to the end of '+year,'ယခုလမှ '+year+' နှစ်ကုန်အထိ')+'</p></div><span class="pdk-fc-year">'+year+'</span></div><div class="pdk-fc-summary"><div><b>'+months.length+'</b><span>'+t('Months','လ')+'</span></div><div><b>'+new Set(all.map(e=>e.date)).size+'</b><span>'+t('Festival dates','ပွဲရက်များ')+'</span></div><div><b>'+all.length+'</b><span>'+t('Events','ပွဲများ')+'</span></div></div></section><section class="panel"><h3>✨ '+t('Upcoming festivals','လာမည့်ပွဲတော်များ')+'</h3><div class="pdk-fc-upcoming">'+upcoming.map(e=>'<div class="pdk-fc-upcoming-item"><div class="pdk-fc-upcoming-date">'+dateLabel(e.date)+'</div><div><strong>'+escapeHtml(e.icon+' '+e.title)+'</strong><small>'+escapeHtml(e.kind+' · '+e.status)+'</small></div></div>').join('')+'</div></section><div class="pdk-fc-months">'+monthHtml+'</div><section class="panel" id="pdkFestivalVideoManager"><h3>🎬 '+t('Festival Video Manager','ပွဲတော် Video စီမံခန့်ခွဲမှု')+'</h3><p class="subtle">'+t('Upload one video for each festival. Preview before the date; it will play automatically on the festival date.','ပွဲတစ်ခုချင်းစီအတွက် Video တင်နိုင်ပြီး ပွဲရက်မတိုင်မီ Preview ကြည့်နိုင်ပါသည်။ ပွဲရက်ရောက်လျှင် အလိုအလျောက် ပြသပါမည်။')+'</p><div id="pdkFestivalVideoManagerBody"><p>'+t('Loading festival videos…','Festival Video များ ဖတ်နေသည်…')+'</p></div></section></div>';
    root.querySelectorAll('[data-pdk-fc-date]').forEach(btn=>btn.addEventListener('click',()=>{
      const key=btn.dataset.pdkFcDate;
      if (typeof openThailandFestivalDate === 'function') openThailandFestivalDate(key);
      window.__pdkFestivalDateTimePreview = null;
      setTimeout(()=>syncDateTimeVideo(true),50);
    }));
    renderManager();
  }

  async function renderManager() {
    const host = document.getElementById('pdkFestivalVideoManagerBody');
    if (!host || !currentUser || currentRole !== 'owner') return;
    try {
      const rows = await fetchMedia(true);
      const events = currentEvents();
      const options = events.map(e => '<option value="'+escapeHtml(e.date+'|'+e.title)+'">'+escapeHtml(dateLabel(e.date)+' — '+e.title)+'</option>').join('');
      const existing = rows.filter(r => r.festival_date.slice(0,4) === String(today().year));
      host.innerHTML = '<div class="pdk-fvm-upload"><label for="pdkFestivalChoice">'+t('Festival / date','ပွဲတော် / ရက်စွဲ')+'</label><select id="pdkFestivalChoice">'+options+'</select><label for="pdkFestivalFile">'+t('Video file (MP4, WebM, MOV · max 50 MB)','Video ဖိုင် (MP4, WebM, MOV · အများဆုံး 50 MB)')+'</label><input id="pdkFestivalFile" type="file" accept="video/mp4,video/webm,video/quicktime"><button type="button" id="pdkFestivalUploadBtn" class="gold">'+t('＋ Upload Video','＋ Video တင်မည်')+'</button><p class="pdk-fvm-note">'+t('Only the Owner can upload or delete. Staff can view the scheduled video in Date & Time.','Owner သာ Upload / Delete လုပ်နိုင်ပြီး Staff များက Date & Time တွင် ကြည့်ရှုနိုင်ပါသည်။')+'</p></div><div class="pdk-fvm-list">'+(existing.length?existing.map(r=>'<article class="pdk-fvm-item"><div><strong>'+escapeHtml(r.festival_name)+'</strong><small>'+escapeHtml(dateLabel(r.festival_date))+' · '+(r.file_size_bytes/1048576).toFixed(1)+' MB</small></div><div class="pdk-fvm-actions"><button type="button" data-fvm-preview="'+escapeHtml(r.id)+'">'+t('▶ Preview','▶ ကြိုကြည့်')+'</button><button type="button" class="danger" data-fvm-delete="'+escapeHtml(r.id)+'">'+t('Delete','ဖျက်မည်')+'</button></div></article>').join(''):'<p>'+t('No videos uploaded for this year yet.','ယခုနှစ်အတွက် Video မတင်ရသေးပါ။')+'</p>')+'</div>';
      const select = host.querySelector('#pdkFestivalChoice');
      if (select) {
        const current = select.value;
        const selectedRow = existing.find(r=>r.festival_date+'|'+r.festival_name===current);
        if (selectedRow) host.querySelector('#pdkFestivalUploadBtn').disabled = true;
      }
      host.querySelector('#pdkFestivalUploadBtn')?.addEventListener('click',uploadVideo);
      host.querySelectorAll('[data-fvm-preview]').forEach(btn=>btn.addEventListener('click',()=>previewManagedVideo(btn.dataset.fvmPreview)));
      host.querySelectorAll('[data-fvm-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteManagedVideo(btn.dataset.fvmDelete)));
      const refreshUploadButton = () => {
        const choice = host.querySelector('#pdkFestivalChoice')?.value || '';
        const row = existing.find(r=>r.festival_date+'|'+r.festival_name===choice);
        const button = host.querySelector('#pdkFestivalUploadBtn');
        if (button) button.disabled = !!row || busy;
      };
      select?.addEventListener('change',refreshUploadButton);
      refreshUploadButton();
    } catch (error) {
      host.innerHTML = '<p role="alert">'+t('Could not load festival media: ','Festival Video များ ဖတ်မရပါ: ')+escapeHtml(error.message)+'</p>';
    }
  }

  function loadTusClient() {
    if (window.tus && window.tus.Upload) return Promise.resolve(window.tus);
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-pdk-tus-client]');
      if(existing){existing.addEventListener('load',()=>resolve(window.tus),{once:true});existing.addEventListener('error',()=>reject(new Error('Could not load resumable upload library.')),{once:true});return;}
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/dist/tus.min.js';
      script.async=true;script.dataset.pdkTusClient='1';
      script.onload=()=>window.tus&&window.tus.Upload?resolve(window.tus):reject(new Error('Resumable upload library did not initialize.'));
      script.onerror=()=>reject(new Error('Could not load resumable upload library.'));
      document.head.appendChild(script);
    });
  }

  async function uploadVideo() {
    if (busy) return;
    if (!currentUser || currentRole !== 'owner') { alert(t('Owner access required.','Owner ခွင့်ပြုချက်လိုအပ်ပါသည်။')); return; }
    const host = document.getElementById('pdkFestivalVideoManagerBody');
    const choice = host?.querySelector('#pdkFestivalChoice')?.value || '';
    const file = host?.querySelector('#pdkFestivalFile')?.files?.[0];
    if (!choice || !file) { alert(t('Choose a festival and a video file.','ပွဲတော်နှင့် Video ဖိုင်ကို ရွေးပါ။')); return; }
    if (!/^video\/(mp4|webm|quicktime)$/.test(file.type) || file.size > MAX_BYTES) {
      alert(t('Use MP4, WebM or MOV video up to 50 MB.','MP4, WebM သို့မဟုတ် MOV Video 50 MB အောက်ကိုသာ အသုံးပြုပါ။')); return;
    }
    const [date,name] = choice.split('|');
    if (mediaRows.some(r=>r.festival_date===date && r.festival_name===name)) {
      alert(t('A video already exists. Delete it before uploading a replacement.','Video ရှိပြီးသားဖြစ်သည်။ အသစ်မတင်မီ အဟောင်းကို ဖျက်ပါ။')); return;
    }
    busy = true;
    const button = host.querySelector('#pdkFestivalUploadBtn');
    if (button) { button.disabled = true; button.textContent = t('Uploading…','တင်နေသည်…'); }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-90) || 'festival-video.mp4';
    const path = date+'/'+crypto.randomUUID()+'-'+safeName;
    try {
      const {data:{session},error:sessionError} = await sb.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error('Your login session expired. Sign in again and retry.');
      const tus = await loadTusClient();
      await new Promise((resolve,reject)=>{
        let tusUpload;
        tusUpload = new tus.Upload(file,{
          endpoint:'https://tlefnqzpilajeuyysujb.storage.supabase.co/storage/v1/upload/resumable',
          headers:{authorization:'Bearer '+session.access_token,apikey:SUPABASE_KEY},
          retryDelays:[0,3000,5000,10000,20000],
          uploadDataDuringCreation:true,
          removeFingerprintOnSuccess:true,
          storeFingerprintForResuming:false,
          chunkSize:6*1024*1024,
          metadata:{bucketName:BUCKET,objectName:path,contentType:file.type,cacheControl:'0'},
          onError:error=>{try{tusUpload.abort(true).catch(()=>{})}catch(_){};reject(error)},
          onProgress:(uploaded,total)=>{
            const percent=Math.min(100,Math.round(uploaded/total*100));
            if(button)button.textContent=t('Uploading… ','တင်နေသည်… ')+percent+'%';
          },
          onSuccess:resolve
        });
        tusUpload.start();
      });
      const selectedEvent = currentEvents().find(e=>e.date===date && e.title===name) || {};
      const {data,error:insertError} = await sb.from('festival_media').insert({
        festival_date:date,festival_name:name,
        festival_kind:selectedEvent.kind || 'festival',
        festival_theme:selectedEvent.theme || 'national',
        display_time:'00:00:00',timezone:TZ,
        blob_url:'storage://'+BUCKET+'/'+path,blob_path:path,
        content_type:file.type,file_size_bytes:file.size,created_by:currentUser.id
      }).select('id,festival_date,festival_name,blob_path,content_type,file_size_bytes').single();
      if (insertError) {
        await sb.storage.from(BUCKET).remove([path]);
        throw insertError;
      }
      mediaRows.push(data);
      lastMediaFetch = Date.now();
      signedUrlCache.delete(path);
      alert(t('Video uploaded successfully. It will play automatically on its date.','Video တင်ပြီးပါပြီ။ သတ်မှတ်ရက်ရောက်လျှင် အလိုအလျောက် ပြသပါမည်။'));
      renderManager();
      syncDateTimeVideo(true);
    } catch (error) {
      alert(t('Upload failed: ','တင်မရပါ: ')+error.message);
    } finally {
      busy = false;
      renderManager();
    }
  }

  async function deleteManagedVideo(id) {
    if (busy) return;
    const row = mediaRows.find(r=>r.id===id);
    if (!row) return;
    if (!confirm(t('Permanently delete this video from Cloud Storage and its database record? This cannot be undone.','ဤ Video ကို Cloud Storage နှင့် Database မှ အပြီးတိုင်ဖျက်မလား။ ပြန်ယူ၍မရပါ။'))) return;
    busy = true;
    try {
      const {error:removeError} = await sb.storage.from(BUCKET).remove([row.blob_path]);
      if (removeError) throw removeError;
      const activeCard=document.getElementById('appDateTime');
      const activeVideo=activeCard?.querySelector('.pdk-festival-video');
      if(activeVideo?.dataset.festivalMediaId===id){activeVideo.pause();const original=activeVideo.dataset.originalFestivalSource||'';const source=activeVideo.querySelector('source');if(source&&original)source.setAttribute('src',original);else if(source)source.removeAttribute('src');else if(original)activeVideo.setAttribute('src',original);else activeVideo.removeAttribute('src');activeVideo.load();delete activeVideo.dataset.festivalManaged;delete activeVideo.dataset.festivalMediaId;activeCard.classList.remove('has-owner-festival-video');const scene=activeCard.querySelector('.pdk-festival-scene');if(scene)scene.style.display='';}
      const {error:dbError} = await sb.from('festival_media').delete().eq('id',id);
      if (dbError) {
        alert(t('The file was removed from Storage, but its database record could not be deleted. Retry Delete to finish cleanup: ','Storage မှ ဖိုင်ဖျက်ပြီးပါပြီ။ Database မှတ်တမ်း မဖျက်နိုင်သေးပါ။ Delete ကို ထပ်လုပ်ပါ: ')+dbError.message);
        throw dbError;
      }
      mediaRows = mediaRows.filter(r=>r.id!==id);
      signedUrlCache.delete(row.blob_path);
      lastMediaFetch = Date.now();
      const card = document.getElementById('appDateTime');
      const video = card?.querySelector('.pdk-festival-video');
      if (video?.dataset.festivalMediaId===id) {
        video.pause(); video.removeAttribute('src');
        video.querySelectorAll('source').forEach(source=>source.removeAttribute('src'));
        video.load(); delete video.dataset.festivalManaged; delete video.dataset.festivalMediaId;
        card.classList.remove('has-owner-festival-video');
        const scene=card.querySelector('.pdk-festival-scene'); if(scene) scene.style.display='';
      }
      alert(t('Video and database record deleted. You can upload a new video for this festival.','Video နှင့် Database မှတ်တမ်းကို ဖျက်ပြီးပါပြီ။ Video အသစ်ပြန်တင်နိုင်ပါပြီ။'));
      await renderManager();
      await syncDateTimeVideo(true);
    } catch (error) {
      console.error('Festival video delete failed:',error);
      if (error && error.message) console.warn(error.message);
    } finally {
      busy = false;
      renderManager();
    }
  }

  async function previewManagedVideo(id) {
    const row = mediaRows.find(r=>r.id===id);
    if (!row) return;
    try {
      const url = await signedUrl(row.blob_path);
      const old = document.getElementById('pdkFestivalManagedPreview');
      if (old) old.remove();
      const modal = document.createElement('div');
      modal.id = 'pdkFestivalManagedPreview';
      modal.innerHTML = '<div class="pdk-fvm-preview-panel"><button type="button" aria-label="Close">×</button><video controls playsinline autoplay muted loop preload="auto"></video><p>'+escapeHtml(row.festival_name)+' · '+escapeHtml(dateLabel(row.festival_date))+'</p></div>';
      modal.querySelector('video').src = url;
      document.body.appendChild(modal);
      const close = () => { modal.querySelector('video').pause(); modal.remove(); };
      modal.querySelector('button').addEventListener('click',close);
      modal.addEventListener('click',e=>{if(e.target===modal)close();});
    } catch (error) { alert(t('Preview failed: ','Preview မရပါ: ')+error.message); }
  }

  function installStyles() {
    if (document.getElementById('pdk-festival-video-manager-css')) return;
    const style = document.createElement('style');
    style.id = 'pdk-festival-video-manager-css';
    style.textContent = `
      #pdkFestivalVideoManager .pdk-fvm-upload{display:grid;gap:9px;max-width:620px;padding:14px;border:1px solid rgba(220,190,120,.28);border-radius:14px;background:rgba(8,24,42,.45)}
      #pdkFestivalVideoManager label{font-size:13px;font-weight:750;color:#f4d58c}
      #pdkFestivalVideoManager input,#pdkFestivalVideoManager select{width:100%;min-height:44px;padding:9px;border-radius:9px}
      #pdkFestivalVideoManager button{min-height:44px;padding:9px 13px;border-radius:10px}
      #pdkFestivalVideoManager button:disabled{opacity:.45;cursor:not-allowed}
      .pdk-fvm-note{font-size:12px;opacity:.78;margin:0}
      .pdk-fvm-list{display:grid;gap:8px;margin-top:14px}
      .pdk-fvm-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid rgba(220,190,120,.22);border-radius:12px}
      .pdk-fvm-item strong,.pdk-fvm-item small{display:block}.pdk-fvm-item small{font-size:11px;opacity:.72;margin-top:4px}
      .pdk-fvm-actions{display:flex;gap:7px;flex-wrap:wrap}.pdk-fvm-actions .danger{background:#8e2b35;color:white}
      #pdkFestivalManagedPreview{position:fixed;inset:0;z-index:2147483601;display:grid;place-items:center;padding:12px;background:rgba(0,5,15,.94)}
      #pdkFestivalManagedPreview .pdk-fvm-preview-panel{position:relative;width:min(1000px,96vw);background:#030711;padding:12px;border-radius:14px}
      #pdkFestivalManagedPreview video{width:100%;max-height:76dvh;object-fit:contain}
      #pdkFestivalManagedPreview button{position:absolute;right:18px;top:18px;z-index:2;width:44px;height:44px;border-radius:50%;font-size:25px}
      #pdkFestivalManagedPreview p{color:#fff;text-align:center}
      #appDateTime.has-owner-festival-video .pdk-festival-video{z-index:2;object-fit:cover}
      #appDateTime.has-owner-festival-video .pdk-festival-scene{display:none!important}
      @media(max-width:560px){.pdk-fvm-item{align-items:flex-start;flex-direction:column}.pdk-fvm-actions{width:100%}.pdk-fvm-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyles();
    seed2027 = Array.isArray(window.__pdkThailandFestivalEvents) ? window.__pdkThailandFestivalEvents.map(e=>({...e})) : [];
    lastCalendarYear = today().year;
    if (typeof window.renderThailandFestivalCalendar === 'function') {
      window.renderThailandFestivalCalendar = renderCalendar;
    }
    const holidayLabel=document.getElementById('appHolidayValue');
    if(holidayLabel){new MutationObserver(()=>{const selected=activeDateAndTitle();const row=mediaRows.find(x=>x.festival_date===selected.date&&(selected.title?x.festival_name===selected.title:true))||mediaRows.find(x=>x.festival_date===selected.date);if(row&&(holidayLabel.textContent!==row.festival_name||holidayLabel.hidden)){holidayLabel.textContent=row.festival_name;holidayLabel.hidden=false;holidayLabel.classList.add('is-special');holidayLabel.classList.remove('is-holiday');}}).observe(holidayLabel,{childList:true,characterData:true,subtree:true});}
    if (sb && sb.auth) {
      sb.auth.onAuthStateChange(() => {
        mediaRows=[];lastMediaFetch=0;
        setTimeout(()=>{if(document.getElementById('appDateTime'))syncDateTimeVideo(true);},500);
      });
    }
    setInterval(()=>{
      syncDateTimeVideo(false);
      const yearNow=today().year;
      const root=document.getElementById('pageContent');
      if(yearNow!==lastCalendarYear){lastCalendarYear=yearNow;if(root&&root.dataset.uiPage==='festivals')renderCalendar();}
    },15000);
    window.addEventListener('focus',()=>syncDateTimeVideo(true));
    document.addEventListener('click',event=>{
      if(event.target.closest('[data-fc-datetime-preview]')) setTimeout(()=>syncDateTimeVideo(true),120);
      if(event.target.closest('[data-fc-close],.pdk-fc-close')) setTimeout(()=>syncDateTimeVideo(true),180);
    });
    setTimeout(()=>syncDateTimeVideo(true),1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
