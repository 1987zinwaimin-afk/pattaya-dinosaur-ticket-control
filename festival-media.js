/* Pattaya Dinosaur Kingdom — annual festival calendar + private festival video manager.
 * Additive module. Existing authentication, ticketing and sales code is not modified.
 */
(function () {
  'use strict';

  const BUCKET = 'festival-videos';
  const MAX_BYTES = 50 * 1024 * 1024;
  const COMPRESS_TARGET_BYTES = 44 * 1024 * 1024;
  const TZ = 'Asia/Bangkok';
  if (!document.getElementById('pdk-normal-day-video-manager-v1')) {
    const style = document.createElement('style');
    style.id = 'pdk-normal-day-video-manager-v1';
    style.textContent = `.pdk-day-message-form input[type="file"],.pdk-day-message-form input[type="url"]{width:100%;min-height:44px;padding:10px 12px;border:1px solid rgba(216,190,139,.38);border-radius:10px;background:#071a2d;color:#f6f2e8;font:inherit;box-sizing:border-box}
.pdk-day-message-form input[type="file"]::file-selector-button{margin-right:10px;padding:8px 11px;border:0;border-radius:8px;background:#e5bd70;color:#10233a;font-weight:800}
.pdk-day-message-remove-video{display:flex!important;align-items:center;gap:8px}.pdk-day-message-remove-video input{width:18px;height:18px;min-height:18px}
.pdk-day-video-zoom-control{display:grid;gap:7px;padding:10px 12px;border:1px solid rgba(216,190,139,.3);border-radius:10px;background:rgba(7,26,45,.55)}
.pdk-day-video-zoom-control label{display:flex;align-items:center;justify-content:space-between;gap:10px}
.pdk-day-video-zoom-control output{color:#f2c978;font-weight:800}
.pdk-day-message-form input[type="range"]{width:100%;min-height:34px;accent-color:#e5bd70;touch-action:pan-y}
.pdk-day-video-zoom-control small{color:#c5d2df;font-size:12px}
#appDateTime.has-normal-day-message .app-date-notice{max-width:100%}
#appDateTime.has-normal-day-message .pdk-festival-video,#appDateTime.has-normal-day-video .pdk-festival-video{object-fit:cover!important;background:#07182b!important}`;
    document.head.appendChild(style);
  }


  const signedUrlCache = new Map();
  let mediaRows = [];
  let seed2027 = [];
  let lastCalendarYear = null;
  let lastMediaFetch = 0;
  let busy = false;
  let dayMessageRows = [];
  let lastDayMessageFetch = 0;
  let dayMessageFetchPromise = null;
  let dayMessageBusy = false;

  // Pause active videos while Android Chrome's system file picker backgrounds the page.
  let pickerPausedVideos = [];
  if (!document.documentElement.dataset.pdkPickerLifecycleBound) {
    document.documentElement.dataset.pdkPickerLifecycleBound = '1';
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pickerPausedVideos = Array.from(document.querySelectorAll('video')).filter(video => !video.paused && !video.ended);
        pickerPausedVideos.forEach(video => { try { video.pause(); } catch (_) {} });
      } else {
        // Do not restart media from the file-picker return callback. The active
        // Date & Time player is restored by the normal focus/sync handlers.
        // Restarting every video here can destabilize Android Chrome after a
        // large local file has been selected.
        pickerPausedVideos = [];
      }
    });
  }

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
    const {data,error} = await sb.storage.from(BUCKET).createSignedUrl(path,3600);
    if (error) throw error;
    signedUrlCache.set(path,{url:data.signedUrl,expires:Date.now()+3300000});
    return data.signedUrl;
  }

  function activeDateAndTitle() {
    const preview = window.__pdkFestivalDateTimePreview;
    if (preview && preview.date) return {date:preview.date,title:preview.title || ''};
    const p = today();
    if (!window.__pdkThailandFestivalLookup) setGlobalEvents(eventsForYear(p.year));
    const dayEvents = (window.__pdkThailandFestivalLookup || {})[p.key] || [];
    return {date:p.key,title:dayEvents[0]?.title || ''};
  }

  function builtInVideoForEvent(event) {
    const title = String(event?.title || '').toLowerCase();
    if (title.includes('children')) return '/Thailand%20National%20Children%E2%80%99s%20Day.mp4';
    if (title.includes('new year')) return '/Happy%20NewYear%E2%80%99s.mp4';
    if (title.includes('loy krathong')) return '/Loy%20Krathong%20Festival.mp4';
    // No generic/default footage: each other festival must have its own Owner upload.
    return '';
  }

  function setFestivalVideoNotice(card, message) {
    let notice=card.querySelector('.pdk-festival-video-notice');
    if(!notice){
      notice=document.createElement('div');
      notice.className='pdk-festival-video-notice';
      notice.setAttribute('role','status');
      notice.setAttribute('aria-live','polite');
      card.appendChild(notice);
    }
    notice.textContent=message||'No video has been added for this festival yet.';
    notice.hidden=false;
    card.classList.add('pdk-video-no-media');
  }

  function clearFestivalVideoNotice(card) {
    const notice=card.querySelector('.pdk-festival-video-notice');
    if(notice)notice.hidden=true;
    card.classList.remove('pdk-video-no-media');
  }

  function bindVideoPlayback(card, video) {
    if (video.dataset.festivalPlaybackBound) return;
    video.addEventListener('playing',()=>{card.classList.remove('pdk-video-fallback');card.classList.add('pdk-video-ready');clearFestivalVideoNotice(card)});
    video.addEventListener('error',()=>{
      card.classList.remove('pdk-video-ready');
      card.classList.add('pdk-video-fallback');
      setFestivalVideoNotice(card,'No video is available for this festival.');
    });
    video.dataset.festivalPlaybackBound='1';
  }

  async function syncDateTimeVideo(force) {
    const card=document.getElementById('appDateTime');
    if(!card||!currentUser)return;
    const selected=activeDateAndTitle();
    const events=(window.__pdkThailandFestivalLookup||{})[selected.date]||[];
    const event=selected.title?(events.find(e=>e.title===selected.title)||null):(events[0]||null);
    const video=card.querySelector('.pdk-festival-video');
    if(!video)return;
    const source=video.querySelector('source');
    const scene=card.querySelector('.pdk-festival-scene');
    const holidayLabel=document.getElementById('appHolidayValue');
    if(!video.dataset.pdkOriginalSrc)video.dataset.pdkOriginalSrc=source?.getAttribute('src')||video.getAttribute('src')||'';
    const currentSource=()=>source?.getAttribute('src')||video.getAttribute('src')||'';
    const setSource=(url,managed,id)=>{
      if(currentSource()!==url){
        card.classList.remove('pdk-video-ready','pdk-video-fallback');
        bindVideoPlayback(card,video);
        video.pause();
        if(source)source.src=url;else video.src=url;
        video.preload='auto';video.muted=true;video.defaultMuted=true;video.volume=0;
        video.loop=true;video.playsInline=true;
        video.setAttribute('muted','');video.setAttribute('loop','');video.setAttribute('playsinline','');
        video.load();
      }
      if(managed){delete video.dataset.festivalBuiltin;video.dataset.festivalManaged='1';video.dataset.festivalMediaId=id||'';}
      else{delete video.dataset.festivalManaged;delete video.dataset.festivalMediaId;video.dataset.festivalBuiltin='1';}
      card.classList.add('has-owner-festival-video');
      clearFestivalVideoNotice(card);
      const art=card.querySelector('.pdk-festival-art');
      art?.querySelectorAll('.pdk-calendar-preview-video,.pdk-calendar-preview-art,.pdk-auto-festival-canvas').forEach(el=>el.remove());
      if(video.paused){const play=video.play();if(play&&play.catch)play.catch(()=>{});}
    };
    if(!event){
      // A normal-day notice shares this Date & Time video element. Do not clear
      // its source during the festival sync cycle: doing so caused a visible
      // flash while syncNormalDayNotice re-attached the same signed URL.
      const normalDayOwnsVideo = video.dataset.normalDayManaged === 'yes';
      if(!normalDayOwnsVideo){
        video.pause();video.removeAttribute('autoplay');video.preload='none';
        if(source)source.removeAttribute('src');else video.removeAttribute('src');
        video.load();delete video.dataset.festivalManaged;delete video.dataset.festivalMediaId;delete video.dataset.festivalBuiltin;
        card.classList.remove('has-owner-festival-video','pdk-video-ready','pdk-video-fallback','pdk-video-no-media');
        clearFestivalVideoNotice(card);
      }
      if(scene)scene.style.display='';
      if(holidayLabel)holidayLabel.hidden=true;
      await syncNormalDayNotice(!!force);
      try{await fetchMedia(!!force);}catch(error){console.warn('Festival video metadata check failed:',error);}
      return;
    }
    if(holidayLabel){holidayLabel.textContent=event.title;holidayLabel.hidden=false;holidayLabel.classList.add('is-special');holidayLabel.classList.remove('is-holiday');}
    // Only play footage explicitly assigned to this festival; never substitute generic PDK/Loy Krathong media.
    const builtIn=builtInVideoForEvent(event);
    if(builtIn)setSource(builtIn,false,null);
    else{
      video.pause();video.removeAttribute('autoplay');video.preload='none';
      if(source)source.removeAttribute('src');else video.removeAttribute('src');
      video.load();delete video.dataset.festivalManaged;delete video.dataset.festivalMediaId;delete video.dataset.festivalBuiltin;
      card.classList.remove('has-owner-festival-video','pdk-video-ready','pdk-video-fallback');
    }
    try{
      const rows=await fetchMedia(!!force);
      const latest=activeDateAndTitle();
      if(latest.date!==selected.date||(latest.title&&latest.title!==event.title))return;
      const row=rows.find(x=>x.festival_date===selected.date&&x.festival_name===event.title)||null;
      if(row){
        const url=await signedUrl(row.blob_path);
        const stillLatest=activeDateAndTitle();
        if(stillLatest.date!==selected.date||(stillLatest.title&&stillLatest.title!==event.title))return;
        setSource(url,true,row.id);
      }else if(!builtIn){
        setFestivalVideoNotice(card,'No video has been added for this festival yet.');
      }
    }catch(error){
      console.warn('Festival video sync failed:',error);
      if(!builtIn)setFestivalVideoNotice(card,'Festival video could not be loaded. Please try again.');
    }
  }
  async function fetchDayMessages(force) {
    if (!currentUser || !sb) return [];
    if (!force && Date.now() - lastDayMessageFetch < 15000) return dayMessageRows;
    if (dayMessageFetchPromise) return dayMessageFetchPromise;
    dayMessageFetchPromise = (async () => {
      const {data,error} = await sb.from('calendar_day_messages')
        .select('id,message_date,title,message,display_from,display_until,is_active,video_path,video_url,video_content_type,video_file_size_bytes,video_zoom,video_position_x,video_position_y,created_at,updated_at')
        .order('message_date',{ascending:true})
        .order('display_from',{ascending:true});
      if (error) throw error;
      dayMessageRows = data || [];
      lastDayMessageFetch = Date.now();
      return dayMessageRows;
    })();
    try { return await dayMessageFetchPromise; }
    finally { dayMessageFetchPromise = null; }
  }

  function isOrdinaryDate(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return false;
    const year = Number(key.slice(0,4));
    return !eventsForYear(year).some(e => e.date === key);
  }

  function nextOrdinaryDate() {
    const p = today();
    const cursor = new Date(Date.UTC(p.year,p.month-1,p.day));
    for (let i=0;i<45;i++) {
      const key = cursor.toISOString().slice(0,10);
      if (isOrdinaryDate(key)) return key;
      cursor.setUTCDate(cursor.getUTCDate()+1);
    }
    return p.key;
  }

  async function syncNormalDayNotice(force) {
    const card = document.getElementById('appDateTime');
    const box = document.getElementById('appDateNoticeValue');
    if (!card || !box || !currentUser) return;
    const selected = activeDateAndTitle();
    const events = (window.__pdkThailandFestivalLookup || {})[selected.date] || [];
    const hide = () => {
      box.hidden = true;
      card.classList.remove('has-normal-day-message','has-normal-day-video');
      const video = card.querySelector('.pdk-festival-video');
      if (video && video.dataset.normalDayManaged === 'yes') {
        card.style.removeProperty('--pdk-normal-day-video-zoom');
        const source = video.querySelector('source');
        video.pause();
        if (source) source.removeAttribute('src'); else video.removeAttribute('src');
        video.load();
        delete video.dataset.normalDayManaged; delete video.dataset.normalDayDate; delete video.dataset.festivalManaged;
        card.classList.remove('has-owner-festival-video','pdk-video-ready','pdk-video-fallback');
      }
    };
    // Festival dates always keep their own festival label/media; normal-day notices never replace them.
    if (events.length) { hide(); return; }
    try {
      const rows = await fetchDayMessages(!!force);
      const parts = new Intl.DateTimeFormat('en-GB',{
        timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'
      }).formatToParts(new Date());
      const hour = Number(parts.find(x=>x.type==='hour')?.value || 0);
      const minute = Number(parts.find(x=>x.type==='minute')?.value || 0);
      const nowMinutes = hour*60+minute;
      const row = rows.filter(x => {
        if (x.message_date !== selected.date || !x.is_active) return false;
        const from = String(x.display_from || '00:00').slice(0,5).split(':').map(Number);
        const until = String(x.display_until || '23:59').slice(0,5).split(':').map(Number);
        return nowMinutes >= from[0]*60+from[1] && nowMinutes < until[0]*60+until[1];
      }).sort((a,b)=>String(a.display_from).localeCompare(String(b.display_from)))[0];
      if (!row) { hide(); return; }
      const title = document.getElementById('appDateNoticeTitle');
      const message = document.getElementById('appDateNoticeText');
      const video = card.querySelector('.pdk-festival-video');
      const source = video?.querySelector('source');
      const normalVideoSource = row.video_path ? await signedUrl(row.video_path) : (row.video_url || '');
      const videoOnlyNotice = !!normalVideoSource && !row.message;
      const normalDayZoom = Math.max(50,Math.min(200,Number(row.video_zoom)||100));
       const normalDayX = Math.max(-100,Math.min(100,Number(row.video_position_x)||0));
       const normalDayY = Math.max(-100,Math.min(100,Number(row.video_position_y)||0));
      // Zoom only the rendered Date & Time viewport; never alter or re-encode the uploaded source.
      card.style.setProperty('--pdk-normal-day-video-zoom', String(normalDayZoom/100));
      if (video) {
        video.style.position = 'absolute';
        video.style.inset = 'auto';
        video.style.left = (50+normalDayX)+'%';
        video.style.top = (50+normalDayY)+'%';
        video.style.width = (normalDayZoom/100*100)+'%';
        video.style.height = (normalDayZoom/100*100)+'%';
        video.style.maxWidth = 'none';
        video.style.maxHeight = 'none';
        video.style.objectFit = 'cover';
        video.style.objectPosition = 'center center';
        video.style.transformOrigin = 'center center';
        video.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
        video.style.setProperty('left', (50+normalDayX)+'%', 'important');
        video.style.setProperty('top', (50+normalDayY)+'%', 'important');
        video.style.setProperty('width', (normalDayZoom)+'%', 'important');
        video.style.setProperty('height', (normalDayZoom)+'%', 'important');
        video.style.setProperty('object-fit', 'cover', 'important');
      }
      // A video-only notice must show its video, not the uploaded filename as a text title.
      if (title) { title.textContent = row.title || ''; title.hidden = !row.title || videoOnlyNotice; }
      if (message) { message.textContent = row.message || ''; message.hidden = !row.message; }
      box.hidden = videoOnlyNotice || !(row.title || row.message);
      card.classList.toggle('has-normal-day-message', !box.hidden);
      card.classList.toggle('has-normal-day-video', !!normalVideoSource);
      if (video && normalVideoSource) {
        const current = source?.getAttribute('src') || video.getAttribute('src') || '';
        if (current !== normalVideoSource || video.dataset.normalDayManaged !== 'yes') {
          video.pause();
          if (source) source.src = normalVideoSource; else video.src = normalVideoSource;
          video.dataset.normalDayManaged = 'yes';
          video.dataset.normalDayDate = row.message_date;
          video.dataset.festivalManaged = '1';
          video.preload = 'auto'; video.muted = true; video.defaultMuted = true; video.volume = 0;
          video.loop = true; video.playsInline = true;
          video.setAttribute('muted',''); video.setAttribute('loop',''); video.setAttribute('playsinline','');
          card.classList.add('has-owner-festival-video');
          card.classList.remove('pdk-video-ready','pdk-video-fallback');
          video.load();
          const play = video.play(); if (play && play.catch) play.catch(() => {});
        }
      } else if (video && video.dataset.normalDayManaged === 'yes') {
        video.pause();
        if (source) source.removeAttribute('src'); else video.removeAttribute('src');
        video.load();
        delete video.dataset.normalDayManaged; delete video.dataset.normalDayDate; delete video.dataset.festivalManaged;
        card.classList.remove('has-owner-festival-video','pdk-video-ready','pdk-video-fallback');
      }
    } catch (error) {
      console.warn('Normal-day Date & Time message could not be loaded:',error);
    }
  }


  // Compress oversized videos in the browser so Supabase Free's 50 MB/object
  // limit can still be respected. The source File is never modified.
  async function prepareUploadVideo(file, onProgress) {
    if (!file || file.size <= MAX_BYTES) return file;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error(t('This browser cannot compress large videos. Please use Chrome on Android or choose a smaller video.','ဤ Browser တွင် Video အကြီးစားကို ချုံ့မရပါ။ Android Chrome ကိုသုံးပါ သို့မဟုတ် Video ဖိုင်အသေးကို ရွေးပါ။'));
    }
    const sourceUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = sourceUrl;
    video.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    let recorder, animationFrame = 0, stream;
    const chunks = [];
    const cleanup = () => {
      cancelAnimationFrame(animationFrame);
      try { if (video.pause) video.pause(); } catch (_) {}
      try { if (stream) stream.getTracks().forEach(track=>track.stop()); } catch (_) {}
      try { video.removeAttribute('src'); video.load(); video.remove(); } catch (_) {}
      URL.revokeObjectURL(sourceUrl);
    };
    try {
      await new Promise((resolve,reject)=>{
        video.onloadedmetadata=resolve;
        video.onerror=()=>reject(new Error(t('The selected video could not be decoded by this browser.','ရွေးထားသော Video ကို ဤ Browser မှ ဖွင့်ဖတ်မရပါ။')));
      });
      const width=video.videoWidth||1280, height=video.videoHeight||720;
      if(!width||!height||!Number.isFinite(video.duration)||video.duration<=0) throw new Error(t('Could not read the video duration or dimensions.','Video ကြာချိန်နှင့် အရွယ်အစားကို ဖတ်မရပါ။'));
      const scale=Math.min(1,1280/width,720/height);
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(2,Math.round(width*scale/2)*2);
      canvas.height=Math.max(2,Math.round(height*scale/2)*2);
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx) throw new Error('Video compression is unavailable on this device.');
      const videoBitrate=Math.max(120000,Math.min(3200000,Math.floor((COMPRESS_TARGET_BYTES*8/video.duration)-112000)));
      const mimeCandidates=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
      const mimeType=mimeCandidates.find(type=>MediaRecorder.isTypeSupported(type));
      if(!mimeType) throw new Error(t('WebM video compression is not supported by this browser. Please use Chrome on Android.','ဤ Browser တွင် WebM ချုံ့ခြင်း မရနိုင်ပါ။ Android Chrome ကို အသုံးပြုပါ။'));
      stream=canvas.captureStream(24);
      try {
        const captured=video.captureStream?video.captureStream():null;
        captured?.getAudioTracks().forEach(track=>stream.addTrack(track));
      } catch (_) {}
      recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:videoBitrate,audioBitsPerSecond:96000});
      const finished=new Promise((resolve,reject)=>{
        recorder.ondataavailable=event=>{if(event.data&&event.data.size)chunks.push(event.data);};
        recorder.onerror=event=>reject(event.error||new Error('Video compression failed.'));
        recorder.onstop=()=>resolve();
      });
      video.ontimeupdate=()=>{
        if(onProgress) onProgress(Math.min(99,Math.round(video.currentTime/video.duration*100)));
      };
      const draw=()=>{
        if(video.readyState>=2) ctx.drawImage(video,0,0,canvas.width,canvas.height);
        if(!video.ended&&!video.paused) animationFrame=requestAnimationFrame(draw);
      };
      recorder.start(1000);
      await video.play();
      draw();
      await new Promise((resolve,reject)=>{
        video.onended=resolve;
        video.onerror=()=>reject(new Error('Video playback stopped during compression.'));
      });
      if(recorder.state!=='inactive') recorder.stop();
      await finished;
      const blob=new Blob(chunks,{type:mimeType});
      if(!blob.size) throw new Error(t('Video compression produced an empty file.','Video ချုံ့ရာတွင် ဖိုင်အလွတ်ဖြစ်သွားပါသည်။'));
      if(blob.size>MAX_BYTES) throw new Error(t('This video is too long to fit under 50 MB even after compression. Try a shorter clip.','ချုံ့ပြီးသော်လည်း 50 MB အောက် မရောက်နိုင်ပါ။ Video အတိုကို ရွေးပါ။'));
      if(onProgress) onProgress(100);
      const baseName=(file.name||'video').replace(/\.[^.]+$/,'');
      return new File([blob],baseName+'.webm',{type:'video/webm',lastModified:Date.now()});
    } finally {
      if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch(_){}}
      cleanup();
    }
  }

  async function renderDayMessageManager() {
    const host = document.getElementById('pdkCalendarDayMessageManager');
    if (!host || !currentUser || currentRole !== 'owner') return;
    try {
      const rows = await fetchDayMessages(true);
      const defaultDate = nextOrdinaryDate();
      host.innerHTML =
        '<form class="pdk-day-message-form" data-pdk-day-message-form>' +
          '<div class="pdk-day-message-fields">' +
            '<label>'+t('Date','ရက်စွဲ')+'<input name="message_date" type="date" value="'+defaultDate+'" required></label>' +
            '<label>'+t('Display from','စတင်ပြသချိန်')+'<input name="display_from" type="time" value="00:00" required></label>' +
            '<label>'+t('Display until','ပြီးဆုံးချိန်')+'<input name="display_until" type="time" value="23:59" required></label>' +
            '<label>'+t('Title','ခေါင်းစဉ်')+'<input name="title" type="text" maxlength="120" placeholder="'+t('e.g. Special operating hours','ဥပမာ - အထူးဖွင့်ချိန်')+'" required></label>' +
            '<label class="pdk-day-message-wide">'+t('Message shown in Date & Time (optional)','Date & Time တွင်ပြမည့်စာသား (မဖြစ်မနေမဟုတ်ပါ)')+'<textarea name="message" rows="2" maxlength="600" placeholder="'+t('Write the notice for staff…','Staff များဖတ်ရန် အသိပေးစာရေးပါ…')+'"></textarea></label>' +
            '<div class="pdk-day-message-wide"><label for="pdkDayMessageVideo">'+t('Video file (MP4 / WebM / MOV · files over 50 MB are auto-compressed)','Video ဖိုင် (MP4 / WebM / MOV · 50 MB ကျော်လျှင် အလိုအလျောက် ချုံ့မည်)')+'</label><input id="pdkDayMessageVideo" name="video_file" type="file" accept="video/*,.mp4,.webm,.mov"></div>' +
            '<div class="pdk-day-video-editor pdk-day-message-wide"><div class="pdk-day-video-editor-head"><strong>'+t('Adjust video in Date & Time','Date & Time အကွက်အတွင်း Video ချိန်ညှိရန်')+'</strong><span data-day-video-zoom-value>100%</span></div><div class="pdk-day-video-stage" data-day-video-stage><video data-day-video-preview muted playsinline loop preload="metadata"></video><span data-day-video-empty>'+t('Choose a video to preview','Preview ကြည့်ရန် Video ရွေးပါ')+'</span><i>'+t('Drag to move · Pinch to zoom','လက်နဲ့ဆွဲရွှေ့ပါ · လက်နှစ်ချောင်းနဲ့ Zoom ချဲ့/ချုံ့ပါ')+'</i></div><input type="hidden" name="video_zoom" value="100"><input type="hidden" name="video_position_x" value="0"><input type="hidden" name="video_position_y" value="0"><div class="pdk-day-video-editor-actions"><button type="button" data-day-video-reset>'+t('Reset position','မူလအနေအထား')+'</button><small>'+t('Adjust here before saving. The Date & Time frame stays fixed.','မသိမ်းမီ ဒီနေရာမှာ ချိန်ညှိပါ။ Date & Time ဘောင် မပြောင်းပါ။')+'</small></div></div>' +
            '<label class="pdk-day-message-wide">'+t('Or direct video URL','သို့မဟုတ် Video URL')+'<input name="video_url" type="url" maxlength="2048" placeholder="https://example.com/video.mp4"></label>' +
            '<label class="pdk-day-message-wide pdk-day-message-remove-video"><input name="remove_video" type="checkbox"> '+t('Remove currently attached video','လက်ရှိ Video ကိုဖယ်ရှားမည်')+'</label>' +
          '</div>' +
          '<div class="pdk-day-message-actions"><label class="pdk-day-message-active"><input name="is_active" type="checkbox" checked> '+t('Active','ဖွင့်ထားမည်')+'</label><button type="button" class="gold" data-day-message-save>'+t('＋ Save message','＋ သိမ်းမည်')+'</button><button type="button" data-day-message-cancel hidden>'+t('Cancel edit','မပြင်တော့ပါ')+'</button><span data-day-message-status role="status" aria-live="polite"></span></div>' +
        '</form>' +
        '<div class="pdk-day-message-list" data-day-message-list>' +
          (rows.length ? rows.slice(0,30).map(row =>
            '<article class="pdk-day-message-item"><div class="pdk-day-message-copy"><strong>'+escapeHtml(dateLabel(row.message_date))+' · '+escapeHtml(row.title)+'</strong><small>'+escapeHtml(String(row.display_from).slice(0,5)+'–'+String(row.display_until).slice(0,5))+' · '+(row.is_active?t('Active','ဖွင့်ထားသည်'):t('Hidden','ပိတ်ထားသည်'))+' · '+(row.video_path||row.video_url?t('Video attached','Video ပါဝင်သည်'):t('Text only','စာသားသာ'))+'</small><p>'+escapeHtml(row.message||'')+'</p></div><div class="pdk-day-message-item-actions"><button type="button" data-day-message-edit="'+escapeHtml(row.id)+'">'+t('Edit','ပြင်မည်')+'</button><button type="button" class="danger" data-day-message-delete="'+escapeHtml(row.id)+'">'+t('Delete','ဖျက်မည်')+'</button></div></article>'
          ).join('') : '<p class="pdk-day-message-empty">'+t('No normal-day messages have been added yet.','ပုံမှန်ရက်အတွက် အသိပေးစာ မထည့်ရသေးပါ။')+'</p>') +
        '</div>';

      const panel = host.closest('details');
      if (panel) {
        if (panel.dataset.dayMessagePickerStateBound !== '1') {
          panel.addEventListener('toggle', () => { try { localStorage.setItem('pdk-day-message-panel-open', panel.open ? '1' : '0'); } catch (_) {} });
          panel.dataset.dayMessagePickerStateBound = '1';
        }
        try { if (localStorage.getItem('pdk-day-message-panel-open') === '1') panel.open = true; } catch (_) {}
      }
      const form = host.querySelector('[data-pdk-day-message-form]');
      const status = host.querySelector('[data-day-message-status]');
      const save = host.querySelector('[data-day-message-save]');
      const cancel = host.querySelector('[data-day-message-cancel]');
      const setStatus = message => { if(status) status.textContent = message || ''; };
      const videoInput = form?.elements.namedItem('video_file');
      const zoomInput = form?.elements.namedItem('video_zoom');
      const positionXInput = form?.elements.namedItem('video_position_x');
      const positionYInput = form?.elements.namedItem('video_position_y');
      const zoomOutput = form?.querySelector('[data-day-video-zoom-value]');
      const previewStage = form?.querySelector('[data-day-video-stage]');
      const previewVideo = form?.querySelector('[data-day-video-preview]');
      const previewEmpty = form?.querySelector('[data-day-video-empty]');
      let previewObjectUrl = '';
      const editorPointers = new Map();
      let pinchStartDistance = 0, pinchStartZoom = 100, dragStart = null;
      const readEditor = () => ({
        zoom:Math.max(50,Math.min(200,Number(zoomInput?.value)||100)),
        x:Math.max(-100,Math.min(100,Number(positionXInput?.value)||0)),
        y:Math.max(-100,Math.min(100,Number(positionYInput?.value)||0))
      });
      const paintEditor = () => {
        // Match the editor viewport to the live Date & Time card's current aspect ratio.
        const liveFrame=document.getElementById('appDateTime');
        if(previewStage&&liveFrame){const frameRect=liveFrame.getBoundingClientRect();if(frameRect.width>0&&frameRect.height>0){previewStage.style.aspectRatio=frameRect.width+'/'+frameRect.height;previewStage.style.minHeight='0';}}
        const p=readEditor();
        if(zoomOutput) zoomOutput.textContent=p.zoom+'%';
        // Keep editor gestures isolated to this editor preview. The live Date & Time
        // player must retain its saved framing until the user presses Save.
        [previewVideo].filter(Boolean).forEach(video=>{
          video.style.setProperty('position','absolute','important');
          video.style.setProperty('left',(50+p.x)+'%','important');
          video.style.setProperty('top',(50+p.y)+'%','important');
          video.style.setProperty('width',p.zoom+'%','important');
          video.style.setProperty('height',p.zoom+'%','important');
          video.style.setProperty('max-width','none','important');
          video.style.setProperty('max-height','none','important');
          video.style.setProperty('object-fit','cover','important');
          video.style.setProperty('object-position','center center','important');
          video.style.setProperty('transform','translate(-50%, -50%)','important');
        });
      };
      const setPreviewSource = url => {
        if(!previewVideo)return;
        if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl='';}
        previewVideo.pause();
        previewVideo.removeAttribute('src');
        if(url){previewObjectUrl=url.startsWith('blob:')?url:'';previewVideo.src=url;previewVideo.load();previewVideo.play().catch(()=>{});if(previewEmpty)previewEmpty.hidden=true;}
        else {previewVideo.load();if(previewEmpty)previewEmpty.hidden=false;}
        paintEditor();
      };
      const resetEditorPosition = () => {
        if(zoomInput)zoomInput.value='100';
        if(positionXInput)positionXInput.value='0';
        if(positionYInput)positionYInput.value='0';
        paintEditor();
      };
      previewStage?.addEventListener('pointerdown',event=>{
        if(!previewVideo?.getAttribute('src'))return;
        event.preventDefault();
        previewStage.setPointerCapture?.(event.pointerId);
        editorPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(editorPointers.size===1){
          const p=readEditor();dragStart={x:event.clientX,y:event.clientY,px:p.x,py:p.y};
        } else if(editorPointers.size===2){
          const pts=[...editorPointers.values()];
          pinchStartDistance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)||1;
          pinchStartZoom=readEditor().zoom;dragStart=null;
        }
      });
      previewStage?.addEventListener('pointermove',event=>{
        if(!editorPointers.has(event.pointerId))return;
        editorPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
        const rect=previewStage.getBoundingClientRect();
        if(editorPointers.size>=2){
          const pts=[...editorPointers.values()];
          const dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
          if(zoomInput)zoomInput.value=String(Math.round(Math.max(50,Math.min(200,pinchStartZoom*dist/pinchStartDistance))));
        } else if(dragStart&&rect.width&&rect.height){
          const p=readEditor();
          if(positionXInput)positionXInput.value=String(Math.max(-100,Math.min(100,dragStart.px+(event.clientX-dragStart.x)/rect.width*100)));
          if(positionYInput)positionYInput.value=String(Math.max(-100,Math.min(100,dragStart.py+(event.clientY-dragStart.y)/rect.height*100)));
        }
        paintEditor();
      });
      const finishPointer=event=>{editorPointers.delete(event.pointerId);dragStart=null;if(editorPointers.size===1){const p=[...editorPointers.values()][0];dragStart={x:p.x,y:p.y,...readEditor(),px:readEditor().x,py:readEditor().y};}};
      previewStage?.addEventListener('pointerup',finishPointer);
      previewStage?.addEventListener('pointercancel',finishPointer);
      form?.querySelector('[data-day-video-reset]')?.addEventListener('click',resetEditorPosition);
      videoInput?.addEventListener('change',()=>{
        const file=videoInput.files?.[0];
        if(file){const objectUrl=URL.createObjectURL(file);setPreviewSource(objectUrl);resetEditorPosition();}
      });
      const applySavedPosition = (row) => {
        if(zoomInput)zoomInput.value=String(Math.max(50,Math.min(200,Number(row?.video_zoom)||100)));
        if(positionXInput)positionXInput.value=String(Number(row?.video_position_x)||0);
        if(positionYInput)positionYInput.value=String(Number(row?.video_position_y)||0);
        paintEditor();
      };
      paintEditor();
      videoInput?.addEventListener('change', () => {
        const selectedFile = videoInput.files && videoInput.files[0];
        if (!selectedFile) return;
        const sizeMb = (selectedFile.size / (1024 * 1024)).toFixed(1);
        // Preview is created by the editor's first change handler above. Do not
        // decode or compress the file here; compression happens only after Save.
        setStatus(t('Selected: ','ရွေးထားသည်: ')+selectedFile.name+' ('+sizeMb+' MB). '+t('Adjust the frame, then press Save message.','ဘောင်ကို ချိန်ညှိပြီး Save message ကိုနှိပ်ပါ။'));
      });
      const resetEditor = () => {
        host.dataset.editingDayMessage = '';
        form.reset();
        form.elements.namedItem('message_date').value = nextOrdinaryDate();
        form.elements.namedItem('display_from').value = '00:00';
        form.elements.namedItem('display_until').value = '23:59';
        form.elements.namedItem('is_active').checked = true;
        form.elements.namedItem('video_file').value = '';
        form.elements.namedItem('video_url').value = '';
        form.elements.namedItem('remove_video').checked = false;
        form.elements.namedItem('video_zoom').value = '100';
        setPreviewSource('');
        paintEditor();
        if(save) save.textContent = t('＋ Save message','＋ သိမ်းမည်');
        if(cancel) cancel.hidden = true;
        setStatus('');
      };
      cancel?.addEventListener('click',resetEditor);
      form?.addEventListener('submit',event=>event.preventDefault());
      save?.addEventListener('click',async event => {
        if (!currentUser || currentRole !== 'owner' || dayMessageBusy) return;
        const date = form.elements.namedItem('message_date').value;
        const from = form.elements.namedItem('display_from').value;
        const until = form.elements.namedItem('display_until').value;
        const titleField = form.elements.namedItem('title');
        const message = form.elements.namedItem('message').value.trim();
        const videoFile = form.elements.namedItem('video_file').files[0] || null;
        const title = titleField.value.trim();
        const active = form.elements.namedItem('is_active').checked;
        const videoUrl = form.elements.namedItem('video_url').value.trim();
        const removeVideo = form.elements.namedItem('remove_video').checked;
        const editingId = host.dataset.editingDayMessage || '';
        const existingRow = editingId ? dayMessageRows.find(x=>x.id===editingId) : null;
        if (!isOrdinaryDate(date)) {
          setStatus(t('Choose a normal date without a festival or public holiday.','ပွဲတော်/ရုံးပိတ်ရက် မရှိသော ပုံမှန်ရက်ကို ရွေးပါ။'));
          return;
        }
        if (!from || !until || from >= until) {
          setStatus(t('End time must be later than start time.','ပြီးဆုံးချိန်သည် စတင်ချိန်ထက် နောက်ကျရပါမည်။'));
          return;
        }
        if (!title && !message && !videoFile && !videoUrl && !(existingRow && (existingRow.video_path || existingRow.video_url) && !removeVideo)) {
          setStatus(t('Add a video, or enter a title or message.','Video ထည့်ပါ၊ သို့မဟုတ် ခေါင်းစဉ်/စာသား ဖြည့်ပါ။'));
          return;
        }
        const allowedVideoTypes = {mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'};
        const detectedVideoType = videoFile ? String(videoFile.type || '').toLowerCase().split(';')[0] : '';
        const mimeExtension = {'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'}[detectedVideoType] || '';
        const rawVideoExt = videoFile ? String(videoFile.name || '').split('.').pop().toLowerCase() : '';
        const videoExt = ['mp4','webm','mov'].includes(rawVideoExt) ? rawVideoExt : mimeExtension;
        const uploadVideoType = videoFile ? (allowedVideoTypes[videoExt] || detectedVideoType) : '';
        if (videoFile && (!['mp4','webm','mov'].includes(videoExt) || !['video/mp4','video/webm','video/quicktime','application/octet-stream',''].includes(detectedVideoType) || !videoFile.size)) {
          setStatus(t('Choose a valid MP4, WebM or MOV video file.','MP4၊ WebM သို့မဟုတ် MOV Video ဖိုင်မှန်ကန်သောဖိုင်ကို ရွေးပါ။'));
          return;
        }
        if (videoUrl && !/^https?:\/\//i.test(videoUrl)) {
          setStatus(t('Enter a direct video URL beginning with http:// or https://.','http:// သို့မဟုတ် https:// ဖြင့်စသော Video URL ထည့်ပါ။'));
          return;
        }
        if (videoFile && videoUrl) {
          setStatus(t('Choose either a video file or a URL, not both.','Video ဖိုင် သို့မဟုတ် URL တစ်မျိုးသာ ရွေးပါ။'));
          return;
        }
        dayMessageBusy = true;
        if(save){save.disabled=true;save.textContent=t('Saving…','သိမ်းနေသည်…');}
        const overlaps = active && dayMessageRows.some(row => {
          if (row.id === editingId || row.message_date !== date || !row.is_active) return false;
          const existingFrom = String(row.display_from).slice(0,5);
          const existingUntil = String(row.display_until).slice(0,5);
          return from < existingUntil && until > existingFrom;
        });
        if (overlaps) {
          dayMessageBusy = false;
          if(save){save.disabled=false;save.textContent=editingId?t('Update message','ပြင်ဆင်သိမ်းမည်'):t('＋ Save message','＋ သိမ်းမည်');}
          setStatus(t('This time overlaps another active message on the same date.','ဤအချိန်သည် တူညီသောရက်စွဲရှိ အသိပေးစာတစ်ခုနှင့် အချိန်ထပ်နေပါသည်။'));
          return;
        }
        let uploadedPath = '';
        const previousPath = existingRow?.video_path || '';
        let nextVideoPath = existingRow?.video_path || null;
        let nextVideoUrl = existingRow?.video_url || null;
        let nextVideoType = existingRow?.video_content_type || null;
        let nextVideoSize = existingRow?.video_file_size_bytes || null;
        try {
          if (videoFile) {
            setStatus(videoFile.size>MAX_BYTES?t('Compressing large video… 0%','Video ဖိုင်ကြီးကို ချုံ့နေသည်… 0%'):t('Preparing video…','Video ပြင်ဆင်နေသည်…'));
            const uploadFile = await prepareUploadVideo(videoFile,percent=>setStatus(t('Compressing large video… ','Video ဖိုင်ကြီးကို ချုံ့နေသည်… ')+percent+'%'));
            const ext = uploadFile.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'') || 'webm';
            const finalVideoType = uploadFile.type || uploadVideoType;
            uploadedPath = 'normal-day/'+currentUser.id+'/'+date+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,9)+'.'+ext;
            setStatus(t('Uploading video…','Video တင်နေသည်…'));
            const {error:uploadError} = await sb.storage.from(BUCKET).upload(uploadedPath,uploadFile,{
              contentType:finalVideoType,upsert:false,cacheControl:'3600'
            });
            if (uploadError) throw uploadError;
            nextVideoPath = uploadedPath; nextVideoUrl = null;
            nextVideoType = finalVideoType; nextVideoSize = uploadFile.size;
          } else if (videoUrl) {
            nextVideoPath = null; nextVideoUrl = videoUrl;
            nextVideoType = null; nextVideoSize = null;
          } else if (removeVideo) {
            nextVideoPath = null; nextVideoUrl = null; nextVideoType = null; nextVideoSize = null;
          }
          const payload = {
            message_date:date,title,message,
            display_from:from+':00',display_until:until+':00',
            is_active:active,video_path:nextVideoPath,video_url:nextVideoUrl,
            video_content_type:nextVideoType,video_file_size_bytes:nextVideoSize,
            video_zoom:Math.max(50,Math.min(200,Number(form.elements.namedItem('video_zoom').value)||100)),
             video_position_x:Math.max(-100,Math.min(100,Number(form.elements.namedItem('video_position_x').value)||0)),
             video_position_y:Math.max(-100,Math.min(100,Number(form.elements.namedItem('video_position_y').value)||0)),
            updated_at:new Date().toISOString()
          };
          const result = editingId
            ? await sb.from('calendar_day_messages').update(payload).eq('id',editingId)
            : await sb.from('calendar_day_messages').insert({...payload,created_by:currentUser.id});
          if (result.error) throw result.error;
          if (previousPath && previousPath !== nextVideoPath && (videoFile || videoUrl || removeVideo)) {
            await sb.storage.from(BUCKET).remove([previousPath]);
          }
          dayMessageRows=[];lastDayMessageFetch=0;
          // Release any local object URL before rebuilding the editor DOM.
          setPreviewSource('');
          await fetchDayMessages(true);
          await renderDayMessageManager();
          await syncNormalDayNotice(true);
        } catch(error) {
          if (uploadedPath) await sb.storage.from(BUCKET).remove([uploadedPath]).catch(()=>{});
          setStatus(t('Could not save: ','သိမ်းမရပါ: ')+error.message);
          if(save){save.disabled=false;save.textContent=editingId?t('Update message','ပြင်ဆင်သိမ်းမည်'):t('＋ Save message','＋ သိမ်းမည်');}
        } finally { dayMessageBusy=false; }
      });
      host.querySelectorAll('[data-day-message-edit]').forEach(button=>button.addEventListener('click',async()=>{
        const row=rows.find(x=>x.id===button.dataset.dayMessageEdit);
        if(!row)return;
        host.dataset.editingDayMessage=row.id;
        form.elements.namedItem('message_date').value=row.message_date;
        form.elements.namedItem('display_from').value=String(row.display_from).slice(0,5);
        form.elements.namedItem('display_until').value=String(row.display_until).slice(0,5);
        form.elements.namedItem('title').value=row.title;
        form.elements.namedItem('message').value=row.message || '';
        form.elements.namedItem('video_file').value='';
        form.elements.namedItem('video_url').value=row.video_url || '';
        form.elements.namedItem('remove_video').checked=false;
        form.elements.namedItem('video_zoom').value=String(row.video_zoom||100);
        form.elements.namedItem('video_position_x').value=String(row.video_position_x||0);
        form.elements.namedItem('video_position_y').value=String(row.video_position_y||0);
        applySavedPosition(row);
        if(row.video_path) setPreviewSource(await signedUrl(row.video_path)); else if(row.video_url) setPreviewSource(row.video_url); else setPreviewSource('');
        form.elements.namedItem('is_active').checked=!!row.is_active;
        if(save)save.textContent=t('Update message','ပြင်ဆင်သိမ်းမည်');
        if(cancel)cancel.hidden=false;
        setStatus('');
        const details=host.closest('details');if(details)details.open=true;
        form.scrollIntoView({behavior:'smooth',block:'nearest'});
      }));
      host.querySelectorAll('[data-day-message-delete]').forEach(button=>button.addEventListener('click',async()=>{
        if(!currentUser||currentRole!=='owner'||dayMessageBusy)return;
        if(!window.confirm(t('Delete this normal-day message?','ဤအသိပေးစာကို ဖျက်မလား။')))return;
        dayMessageBusy=true;
        button.disabled=true;
        try{
          const target=dayMessageRows.find(x=>x.id===button.dataset.dayMessageDelete);
          const {error}=await sb.from('calendar_day_messages').delete().eq('id',button.dataset.dayMessageDelete);
          if(error)throw error;
          if(target?.video_path)await sb.storage.from(BUCKET).remove([target.video_path]);
          dayMessageRows=[];lastDayMessageFetch=0;
          await fetchDayMessages(true);
          await renderDayMessageManager();
          await syncNormalDayNotice(true);
        }catch(error){button.disabled=false;setStatus(t('Could not delete: ','ဖျက်မရပါ: ')+error.message);}
        finally{dayMessageBusy=false;}
      }));
    } catch(error) {
      host.innerHTML='<p class="pdk-day-message-error" role="alert">'+t('Normal-day messages could not be loaded: ','ပုံမှန်ရက်အသိပေးစာများ ဖတ်မရပါ: ')+escapeHtml(error.message)+'</p>';
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
    root.innerHTML = '<div class="pdk-festival-calendar"><section class="panel"><div class="pdk-fc-head"><div><h2>🎉 '+t('Thailand Festival Calendar','ထိုင်းနိုင်ငံ၏ နေ့ထူးနေ့မြတ် ပြက္ခဒိန်')+'</h2><p>'+t('From this month to the end of '+year,'ယခုလမှ '+year+' နှစ်ကုန်အထိ')+'</p></div><span class="pdk-fc-year">'+year+'</span></div><div class="pdk-fc-summary"><div><b>'+months.length+'</b><span>'+t('Months','လ')+'</span></div><div><b>'+new Set(all.map(e=>e.date)).size+'</b><span>'+t('Festival dates','ပွဲရက်များ')+'</span></div><div><b>'+all.length+'</b><span>'+t('Events','ပွဲများ')+'</span></div></div></section><section class="panel"><h3>✨ '+t('Upcoming festivals','လာမည့်ပွဲတော်များ')+'</h3><div class="pdk-fc-upcoming">'+upcoming.map(e=>'<button type="button" class="pdk-fc-upcoming-item" data-pdk-fc-date="'+escapeHtml(e.date)+'" data-pdk-fc-title="'+escapeHtml(e.title)+'"><span class="pdk-fc-upcoming-date">'+dateLabel(e.date)+'</span><span><strong>'+escapeHtml(e.icon+' '+e.title)+'</strong><small>'+escapeHtml(e.kind+' · '+e.status)+'</small></span><span class="pdk-fc-upcoming-open" aria-hidden="true">＋</span></button>').join('')+'</div></section><details class="panel pdk-day-message-panel" id="pdkCalendarDayMessagePanel"><summary><span>📝 '+t('Normal-day Date & Time Messages','ပုံမှန်ရက် Date & Time အသိပေးစာ')+'</span><small>'+t('Owner can schedule a message for any ordinary date and time','ပွဲမရှိသောနေ့တွင် Owner က စာသားနှင့်အချိန် သတ်မှတ်နိုင်သည်')+'</small></summary><div id="pdkCalendarDayMessageManager"><p>'+t('Loading messages…','အသိပေးစာများ ဖတ်နေသည်…')+'</p></div></details><div class="pdk-fc-months">'+monthHtml+'</div><section class="panel" id="pdkFestivalVideoManager"><h3>🎬 '+t('Festival Video Manager','ပွဲတော် Video စီမံခန့်ခွဲမှု')+'</h3><p class="subtle">'+t('Upload one video for each festival. Preview before the date; it will play automatically on the festival date.','ပွဲတစ်ခုချင်းစီအတွက် Video တင်နိုင်ပြီး ပွဲရက်မတိုင်မီ Preview ကြည့်နိုင်ပါသည်။ ပွဲရက်ရောက်လျှင် အလိုအလျောက် ပြသပါမည်။')+'</p><div id="pdkFestivalVideoManagerBody"><p>'+t('Loading festival videos…','Festival Video များ ဖတ်နေသည်…')+'</p></div></section></div>';
    root.querySelectorAll('[data-pdk-fc-date]').forEach(btn=>btn.addEventListener('click',()=>{
      const key=btn.dataset.pdkFcDate;
      const title=btn.dataset.pdkFcTitle||'';
      window.__pdkFestivalDateTimePreview = null;
      openFestivalUploadPopup(key,title);
    }));
    renderManager();
    renderDayMessageManager();
  }


  function openFestivalUploadPopup(date,title) {
    if (typeof openThailandFestivalDate !== 'function') return;
    openThailandFestivalDate(date,title||'');
    const dialog=document.getElementById('pdkThailandFestivalModal');
    const body=dialog?.querySelector('.pdk-fc-modal-body');
    if(!dialog||!body)return;
    body.querySelector('.pdk-fvm-popup-host')?.remove();
    const host=document.createElement('section');
    host.className='pdk-fvm-popup-host';
    host.dataset.pdkFvmHost='true';
    host.dataset.popupDate=date;
    host.dataset.popupTitle=title||'';
    body.appendChild(host);
    renderPopupEditor(dialog,date,title||'');
  }

  async function renderPopupEditor(dialog,date,title) {
    const host=dialog?.querySelector('.pdk-fvm-popup-host');
    if(!host||!date)return;
    try {
      const rows=await fetchMedia(true);
      const events=(window.__pdkThailandFestivalLookup||{})[date]||[];
      const selectedTitle=title||events[0]?.title||'';
      host.dataset.popupDate=date;
      host.dataset.popupTitle=selectedTitle;
      if(!events.length){
        host.innerHTML='<div class="pdk-fvm-popup-empty">'+t('There is no festival assigned to this date.','ဤရက်စွဲတွင် ပွဲတော်သတ်မှတ်ထားခြင်း မရှိသေးပါ။')+'</div>';
        return;
      }
      const options=events.map(e=>'<option value="'+escapeHtml(e.date+'|'+e.title)+'" '+(e.title===selectedTitle?'selected':'')+'>'+escapeHtml(e.title)+'</option>').join('');
      host.innerHTML='<div class="pdk-fvm-popup-head"><div><strong>🎬 '+t('Festival Video Upload','ပွဲတော် Video တင်ရန်')+'</strong><p>'+escapeHtml(dateLabel(date))+' · '+t('Upload a video for the selected festival.','ရွေးထားသောပွဲအတွက် Video တင်နိုင်ပါသည်။')+'</p></div></div>'+
        (events.length>1?'<label>'+t('Festival','ပွဲတော်')+'</label><select data-fvm-choice>'+options+'</select>':'<input type="hidden" data-fvm-choice value="'+escapeHtml(date+'|'+events[0].title)+'">')+
        '<label>'+t('Choose video (MP4, WebM, MOV · over 50 MB auto-compresses)','Video ရွေးပါ (MP4, WebM, MOV · 50 MB ကျော်လျှင် အလိုအလျောက် ချုံ့မည်)')+'</label>'+
        '<input data-fvm-file type="file" accept="video/*,.mp4,.webm,.mov">'+
        '<p class="pdk-fvm-note" data-fvm-file-status role="status" aria-live="polite"></p>'+
        '<button type="button" class="gold" data-fvm-upload>'+t('＋ Upload Video','＋ Video တင်မည်')+'</button>'+
        '<p class="pdk-fvm-note">'+t('Owner only · The video will play automatically on the selected festival date.','Owner သာ အသုံးပြုနိုင်သည် · သတ်မှတ်ရက်တွင် Video အလိုအလျောက် ပြသပါမည်။')+'</p>'+
        '<div class="pdk-fvm-popup-list" data-fvm-list></div>';
      const choice=host.querySelector('[data-fvm-choice]');
      const list=host.querySelector('[data-fvm-list]');
      const uploadButton=host.querySelector('[data-fvm-upload]');
      const renderSelectedRows=()=>{
        const parts=(choice?.value||'').split('|');
        const selectedDate=parts[0]||date;
        const selectedName=parts.slice(1).join('|');
        const existing=rows.filter(r=>r.festival_date===selectedDate&&r.festival_name===selectedName);
        host.dataset.popupTitle=selectedName;
        if(list)list.innerHTML=existing.length?existing.map(r=>'<article class="pdk-fvm-item"><div><strong>'+escapeHtml(r.festival_name)+'</strong><small>'+escapeHtml(dateLabel(r.festival_date))+' · '+(r.file_size_bytes/1048576).toFixed(1)+' MB</small></div><div class="pdk-fvm-actions"><button type="button" data-fvm-preview="'+escapeHtml(r.id)+'">'+t('▶ Preview','▶ ကြိုကြည့်')+'</button><button type="button" class="danger" data-fvm-delete="'+escapeHtml(r.id)+'">'+t('Delete','ဖျက်မည်')+'</button></div></article>'):'<p>'+t('No video uploaded for this festival yet.','ဤပွဲအတွက် Video မတင်ရသေးပါ။')+'</p>';
        if(uploadButton){uploadButton.disabled=!!existing.length||busy;uploadButton.title=existing.length?t('Delete the existing video before replacing it.','Video အသစ်မတင်မီ ရှိပြီးသား Video ကို ဖျက်ပါ။'):'';}
        list?.querySelectorAll('[data-fvm-preview]').forEach(btn=>btn.addEventListener('click',()=>previewManagedVideo(btn.dataset.fvmPreview)));
        list?.querySelectorAll('[data-fvm-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteManagedVideo(btn.dataset.fvmDelete)));
      };
      const popupFileInput=host.querySelector('[data-fvm-file]');
      popupFileInput?.addEventListener('change',()=>{
        const file=popupFileInput.files?.[0],note=host.querySelector('[data-fvm-file-status]');
        if(note&&file) note.textContent=t('Selected: ','ရွေးထားသည်: ')+file.name+' ('+(file.size/1048576).toFixed(1)+' MB). '+t('Press Upload Video when ready.','Upload Video ကိုနှိပ်မှ တင်ပါမည်။');
      });
      uploadButton?.addEventListener('click',uploadVideo);
      choice?.addEventListener('change',()=>{
        const selected=(choice.value||'').split('|');
        host.dataset.popupDate=selected[0]||date;
        renderSelectedRows();
      });
      renderSelectedRows();
    } catch(error) {
      host.innerHTML='<p role="alert">'+t('Could not load festival videos: ','Festival Video များ ဖတ်မရပါ: ')+escapeHtml(error.message)+'</p>';
    }
  }

  async function renderManager() {
    const host = document.getElementById('pdkFestivalVideoManagerBody');
    if (!host || !currentUser || currentRole !== 'owner') return;
    host.dataset.pdkFvmHost='true';
    try {
      const rows = await fetchMedia(true);
      const events = currentEvents();
      const options = events.map(e => '<option value="'+escapeHtml(e.date+'|'+e.title)+'">'+escapeHtml(dateLabel(e.date)+' — '+e.title)+'</option>').join('');
      const existing = rows.filter(r => r.festival_date.slice(0,4) === String(today().year));
      host.innerHTML = '<div class="pdk-fvm-upload"><label for="pdkFestivalChoice">'+t('Festival / date','ပွဲတော် / ရက်စွဲ')+'</label><select id="pdkFestivalChoice" data-fvm-choice>'+options+'</select><label for="pdkFestivalFile">'+t('Video file (MP4, WebM, MOV · over 50 MB auto-compresses)','Video ဖိုင် (MP4, WebM, MOV · 50 MB ကျော်လျှင် အလိုအလျောက် ချုံ့မည်)')+'</label><input id="pdkFestivalFile" data-fvm-file type="file" accept="video/*,.mp4,.webm,.mov"><p class="pdk-fvm-note" data-fvm-file-status role="status" aria-live="polite"></p><button type="button" id="pdkFestivalUploadBtn" data-fvm-upload class="gold">'+t('＋ Upload Video','＋ Video တင်မည်')+'</button><p class="pdk-fvm-note">'+t('Only the Owner can upload or delete. Staff can view the scheduled video in Date & Time.','Owner သာ Upload / Delete လုပ်နိုင်ပြီး Staff များက Date & Time တွင် ကြည့်ရှုနိုင်ပါသည်။')+'</p></div><div class="pdk-fvm-list">'+(existing.length?existing.map(r=>'<article class="pdk-fvm-item"><div><strong>'+escapeHtml(r.festival_name)+'</strong><small>'+escapeHtml(dateLabel(r.festival_date))+' · '+(r.file_size_bytes/1048576).toFixed(1)+' MB</small></div><div class="pdk-fvm-actions"><button type="button" data-fvm-preview="'+escapeHtml(r.id)+'">'+t('▶ Preview','▶ ကြိုကြည့်')+'</button><button type="button" class="danger" data-fvm-delete="'+escapeHtml(r.id)+'">'+t('Delete','ဖျက်မည်')+'</button></div></article>').join(''):'<p>'+t('No videos uploaded for this year yet.','ယခုနှစ်အတွက် Video မတင်ရသေးပါ။')+'</p>')+'</div>';
      const select = host.querySelector('#pdkFestivalChoice');
      if (select) {
        const current = select.value;
        const selectedRow = existing.find(r=>r.festival_date+'|'+r.festival_name===current);
        if (selectedRow) host.querySelector('[data-fvm-upload],#pdkFestivalUploadBtn').disabled = true;
      }
      const managerFileInput=host.querySelector('[data-fvm-file],#pdkFestivalFile');
      managerFileInput?.addEventListener('change',()=>{
        const file=managerFileInput.files?.[0],note=host.querySelector('[data-fvm-file-status]');
        if(note&&file) note.textContent=t('Selected: ','ရွေးထားသည်: ')+file.name+' ('+(file.size/1048576).toFixed(1)+' MB). '+t('Press Upload Video when ready.','Upload Video ကိုနှိပ်မှ တင်ပါမည်။');
      });
      host.querySelector('[data-fvm-upload],#pdkFestivalUploadBtn')?.addEventListener('click',uploadVideo);
      host.querySelectorAll('[data-fvm-preview]').forEach(btn=>btn.addEventListener('click',()=>previewManagedVideo(btn.dataset.fvmPreview)));
      host.querySelectorAll('[data-fvm-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteManagedVideo(btn.dataset.fvmDelete)));
      const refreshUploadButton = () => {
        const choice = host.querySelector('#pdkFestivalChoice')?.value || '';
        const row = existing.find(r=>r.festival_date+'|'+r.festival_name===choice);
        const button = host.querySelector('[data-fvm-upload],#pdkFestivalUploadBtn');
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

  async function uploadVideo(event) {
    if (busy) return;
    if (!currentUser || currentRole !== 'owner') { alert(t('Owner access required.','Owner ခွင့်ပြုချက်လိုအပ်ပါသည်။')); return; }
    const host = event?.currentTarget?.closest('[data-pdk-fvm-host]') || document.getElementById('pdkFestivalVideoManagerBody');
    const choice = host?.querySelector('[data-fvm-choice],#pdkFestivalChoice')?.value || '';
    const file = host?.querySelector('[data-fvm-file],#pdkFestivalFile')?.files?.[0];
    if (!choice || !file) { alert(t('Choose a festival and a video file.','ပွဲတော်နှင့် Video ဖိုင်ကို ရွေးပါ။')); return; }
    const selectedMime=String(file.type||'').toLowerCase().split(';')[0];
    const rawSelectedExt=(file.name||'').split('.').pop().toLowerCase();
    const mimeSelectedExt={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'}[selectedMime] || '';
    const selectedExt=['mp4','webm','mov'].includes(rawSelectedExt)?rawSelectedExt:mimeSelectedExt;
    if (!['mp4','webm','mov'].includes(selectedExt) || (selectedMime && !['video/mp4','video/webm','video/quicktime','application/octet-stream'].includes(selectedMime))) {
      alert(t('Choose a valid MP4, WebM or MOV video file.','MP4၊ WebM သို့မဟုတ် MOV Video ဖိုင်မှန်ကန်သောဖိုင်ကို ရွေးပါ။')); return;
    }
    const [date,name] = choice.split('|');
    if (mediaRows.some(r=>r.festival_date===date && r.festival_name===name)) {
      alert(t('A video already exists. Delete it before uploading a replacement.','Video ရှိပြီးသားဖြစ်သည်။ အသစ်မတင်မီ အဟောင်းကို ဖျက်ပါ။')); return;
    }
    busy = true;
    const button = host.querySelector('[data-fvm-upload],#pdkFestivalUploadBtn');
    if (button) { button.disabled = true; button.textContent = t('Uploading…','တင်နေသည်…'); }
    let path = '';
    try {
      const uploadFile = await prepareUploadVideo(file,percent=>{if(button)button.textContent=t('Compressing… ','ချုံ့နေသည်… ')+percent+'%';});
      const safeName = (uploadFile.name||'festival-video.webm').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-90) || 'festival-video.webm';
      const uploadType = uploadFile.type || ({mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'}[selectedExt] || 'video/webm');
      const {data:{session},error:sessionError} = await sb.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error('Your login session expired. Sign in again and retry.');
      path = date+'/'+crypto.randomUUID()+'-'+safeName;
      const tus = await loadTusClient();
      await new Promise((resolve,reject)=>{
        let tusUpload;
        tusUpload = new tus.Upload(uploadFile,{
          endpoint:'https://tlefnqzpilajeuyysujb.storage.supabase.co/storage/v1/upload/resumable',
          headers:{authorization:'Bearer '+session.access_token,apikey:SUPABASE_KEY},
          retryDelays:[0,3000,5000,10000,20000],
          uploadDataDuringCreation:true,
          removeFingerprintOnSuccess:true,
          storeFingerprintForResuming:false,
          chunkSize:6*1024*1024,
          metadata:{bucketName:BUCKET,objectName:path,contentType:uploadType,cacheControl:'0'},
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
        content_type:uploadType,file_size_bytes:uploadFile.size,created_by:currentUser.id
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
      if (host?.dataset.popupDate) await renderPopupEditor(document.getElementById('pdkThailandFestivalModal'),date,name);
      syncDateTimeVideo(true);
    } catch (error) {
      alert(t('Upload failed: ','တင်မရပါ: ')+error.message);
    } finally {
      busy = false;
      renderManager();
      const popup=document.getElementById('pdkThailandFestivalModal');
      const popupHost=popup?.querySelector('.pdk-fvm-popup-host');
      if(popupHost) renderPopupEditor(popup,popupHost.dataset.popupDate,popupHost.dataset.popupTitle);
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
        card.classList.remove('has-owner-festival-video','pdk-video-ready','pdk-video-fallback');
        const scene=card.querySelector('.pdk-festival-scene'); if(scene) scene.style.display='';
      }
      alert(t('Video and database record deleted. You can upload a new video for this festival.','Video နှင့် Database မှတ်တမ်းကို ဖျက်ပြီးပါပြီ။ Video အသစ်ပြန်တင်နိုင်ပါပြီ။'));
      await renderManager();
      if (document.getElementById('pdkThailandFestivalModal')?.querySelector('.pdk-fvm-popup-host')) {
        const popupHost=document.querySelector('.pdk-fvm-popup-host');
        await renderPopupEditor(document.getElementById('pdkThailandFestivalModal'),popupHost?.dataset.popupDate,popupHost?.dataset.popupTitle);
      }
      await syncDateTimeVideo(true);
    } catch (error) {
      console.error('Festival video delete failed:',error);
      if (error && error.message) console.warn(error.message);
    } finally {
      busy = false;
      renderManager();
      const popup=document.getElementById('pdkThailandFestivalModal');
      const popupHost=popup?.querySelector('.pdk-fvm-popup-host');
      if(popupHost) renderPopupEditor(popup,popupHost.dataset.popupDate,popupHost.dataset.popupTitle);
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

      .pdk-fc-upcoming-item{width:100%;text-align:left;cursor:pointer;color:inherit;font:inherit;background:rgba(7,24,43,.56);border:1px solid rgba(220,190,120,.22);display:grid;grid-template-columns:minmax(100px,145px) 1fr 28px;align-items:center;gap:12px}
      .pdk-fc-upcoming-item:hover{border-color:rgba(244,213,140,.78);background:rgba(18,49,75,.72)}
      .pdk-fc-upcoming-item:focus-visible{outline:3px solid #f4d58c;outline-offset:3px}
      .pdk-fc-upcoming-open{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;border:1px solid rgba(244,213,140,.45);color:#f4d58c;font-size:20px}
      .pdk-fvm-popup-host{display:grid;gap:9px;margin-top:16px;padding:15px;border:1px solid rgba(220,190,120,.42);border-radius:16px;background:linear-gradient(135deg,rgba(7,24,43,.96),rgba(12,39,61,.94));box-shadow:0 10px 30px rgba(0,0,0,.24)}
      .pdk-fvm-popup-head strong{display:block;color:#f4d58c;font-size:16px}
      .pdk-fvm-popup-head p{margin:5px 0 0;font-size:12px;opacity:.82}
      .pdk-fvm-popup-host label{font-size:13px;font-weight:750;color:#f4d58c}
      .pdk-fvm-popup-host input[type=file],.pdk-fvm-popup-host select{width:100%;min-height:46px;padding:10px;border:1px solid rgba(220,190,120,.35);border-radius:10px;background:#071b30;color:#fff}
      .pdk-fvm-popup-host button{min-height:44px;padding:9px 13px;border-radius:10px}
      .pdk-fvm-popup-host button:disabled{opacity:.45;cursor:not-allowed}
      .pdk-fvm-popup-list{display:grid;gap:8px;margin-top:5px}
      .pdk-fvm-popup-empty{padding:12px;border-radius:10px;background:rgba(0,0,0,.2);font-size:13px}
      #appDateTime .pdk-auto-festival-canvas,#appDateTime .pdk-calendar-preview-art{display:none!important}
      @media(max-width:560px){.pdk-fc-upcoming-item{grid-template-columns:1fr 28px;gap:5px}.pdk-fc-upcoming-date{grid-column:1/-1}.pdk-fvm-popup-host{padding:12px}}
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
      #appDateTime.has-owner-festival-video .pdk-festival-video{display:block!important;opacity:0!important;visibility:visible!important;z-index:2;object-fit:cover}
      #appDateTime.has-owner-festival-video:not(.pdk-video-ready):not(.pdk-video-fallback) .pdk-festival-scene{display:block!important;opacity:1!important;visibility:visible!important}
      #appDateTime.has-owner-festival-video.pdk-video-ready .pdk-festival-video{opacity:1!important}
      #appDateTime.has-owner-festival-video.pdk-video-ready .pdk-festival-scene{display:none!important}
      #appDateTime.has-owner-festival-video.pdk-video-fallback .pdk-festival-video{display:none!important}
      #appDateTime.has-owner-festival-video.pdk-video-fallback .pdk-festival-scene{display:block!important;opacity:1!important;visibility:visible!important}
      #appDateTime .pdk-auto-festival-canvas,#appDateTime .pdk-calendar-preview-art{display:none!important}
      @media(max-width:560px){.pdk-fvm-item{align-items:flex-start;flex-direction:column}.pdk-fvm-actions{width:100%}.pdk-fvm-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyles();
    seed2027 = Array.isArray(window.__pdkThailandFestivalEvents) ? window.__pdkThailandFestivalEvents.map(e=>({...e})) : [];
    lastCalendarYear = today().year;
    // Staff and Event Staff pages do not include the Owner calendar script.
    // Seed their date lookup here so the same festival footage works on every role.
    setGlobalEvents(eventsForYear(lastCalendarYear));
    if (typeof window.renderThailandFestivalCalendar === 'function') {
      window.renderThailandFestivalCalendar = renderCalendar;
    }
    const holidayLabel=document.getElementById('appHolidayValue');
    if(holidayLabel){new MutationObserver(()=>{const selected=activeDateAndTitle();const row=mediaRows.find(x=>x.festival_date===selected.date&&(selected.title?x.festival_name===selected.title:true))||mediaRows.find(x=>x.festival_date===selected.date);if(row&&(holidayLabel.textContent!==row.festival_name||holidayLabel.hidden)){holidayLabel.textContent=row.festival_name;holidayLabel.hidden=false;holidayLabel.classList.add('is-special');holidayLabel.classList.remove('is-holiday');}}).observe(holidayLabel,{childList:true,characterData:true,subtree:true});}
    if (sb && sb.auth) {
      sb.auth.onAuthStateChange(() => {
        mediaRows=[];lastMediaFetch=0;dayMessageRows=[];lastDayMessageFetch=0;
        setTimeout(()=>{if(document.getElementById('appDateTime')){syncDateTimeVideo(true);syncNormalDayNotice(true);}},500);
      });
    }
    setInterval(()=>{
      // Android Chrome may background this page while the system file picker is open.
      // Never run video/database sync work while the document is hidden.
      if (document.hidden) return;
      syncDateTimeVideo(false);
      syncNormalDayNotice(false);
      const yearNow=today().year;
      const root=document.getElementById('pageContent');
      if(yearNow!==lastCalendarYear){lastCalendarYear=yearNow;if(root&&root.dataset.uiPage==='festivals')renderCalendar();}
    },15000);
    // Do not reload/restart Date & Time media on window focus. Android Chrome fires
    // focus when returning from the system file picker; doing network + video work
    // at that moment can crash or close the Preview tab on mobile devices.
    document.addEventListener('click',event=>{
      if(event.target.closest('[data-fc-datetime-preview]')) setTimeout(()=>syncDateTimeVideo(true),120);
      if(event.target.closest('[data-fc-close],.pdk-fc-close')) setTimeout(()=>syncDateTimeVideo(true),180);
    });
    setTimeout(()=>{syncDateTimeVideo(true);syncNormalDayNotice(true);},0);
  }

  // Expose the single authoritative player so Calendar Preview never creates a second video layer.
  window.__pdkSyncFestivalDateTime = syncDateTimeVideo;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
/* Date & Time notice styling shared by Owner and Staff applications. */
(function(){
  if(document.getElementById('pdk-date-time-normal-day-message-style'))return;
  const style=document.createElement('style');
  style.id='pdk-date-time-normal-day-message-style';
  style.textContent=
    '.pdk-day-video-editor{margin-top:10px;padding:12px;border:1px solid rgba(239,202,128,.35);border-radius:14px;background:rgba(4,20,36,.48)}'+
    '.pdk-day-video-editor-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px;color:#ffe0a0}'+
    '.pdk-day-video-stage{position:relative;width:100%;aspect-ratio:auto;min-height:0;overflow:hidden;border:1px solid rgba(239,202,128,.55);border-radius:10px;background:#07182b;touch-action:none;user-select:none;cursor:grab}'+
    '.pdk-day-video-stage:active{cursor:grabbing}'+
    '.pdk-day-video-stage video{position:absolute!important;left:50%!important;top:50%!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;background:#07182b!important;object-position:center!important;transform:translate(-50%,-50%)!important;pointer-events:none}'+
    '.pdk-day-video-stage [data-day-video-empty]{position:absolute;inset:0;display:grid;place-items:center;color:#dbe8f3;font-size:13px;pointer-events:none}'+
    '.pdk-day-video-stage i{position:absolute;left:8px;right:8px;bottom:7px;text-align:center;color:#fff;font-size:11px;font-style:normal;text-shadow:0 1px 4px #000;pointer-events:none}'+
    '.pdk-day-video-editor-actions{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}'+
    '.pdk-day-video-editor-actions button{padding:8px 12px;border-radius:9px}'+
    '.pdk-day-video-editor-actions small{color:#c7d6e4;font-size:11px}'+
    '#appDateTime .app-datetime-date{flex:1 1 auto;min-width:0}'+
    '#appDateTime .app-date-notice{display:flex;flex-direction:column;gap:2px;max-width:min(440px,100%);margin-top:5px;padding:6px 9px;border:1px solid rgba(239,202,128,.42);border-radius:8px;background:rgba(3,19,35,.68);box-shadow:inset 0 1px rgba(255,255,255,.04)}'+
    '#appDateTime .app-date-notice[hidden]{display:none!important}'+
    '#appDateTime .app-date-notice strong{color:#ffe0a0;font-size:11px;line-height:1.3;overflow-wrap:anywhere}'+
    '#appDateTime .app-date-notice span{color:#e4edf4;font-size:10px;line-height:1.4;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'+
    '#appDateTime.has-normal-day-message:not(.has-festival-theme):not(.is-calendar-preview),#appDateTime.has-normal-day-video:not(.has-festival-theme):not(.is-calendar-preview){min-height:140px!important}'+
    '@media(max-width:520px){#appDateTime .app-date-notice{max-width:100%;padding:5px 7px}#appDateTime .app-date-notice strong{font-size:10px}#appDateTime .app-date-notice span{font-size:9px}#appDateTime.has-normal-day-message:not(.has-festival-theme):not(.is-calendar-preview),#appDateTime.has-normal-day-video:not(.has-festival-theme):not(.is-calendar-preview){min-height:126px!important}}';
  (document.head||document.documentElement).appendChild(style);
})();
/* v5: one authoritative Date & Time media layer; no stacked video/canvas renderers. */
(function(){
  if(document.getElementById('pdk-festival-video-visibility-fix-v5')) return;
  const style=document.createElement('style');
  style.id='pdk-festival-video-visibility-fix-v5';
  style.textContent=
    '#appDateTime .pdk-auto-festival-canvas,#appDateTime .pdk-calendar-preview-video,#appDateTime .pdk-calendar-preview-gif,#appDateTime .pdk-calendar-preview-art{display:none!important}'+
    '#appDateTime{position:relative!important;overflow:hidden!important}'+
     '#appDateTime .pdk-festival-art{overflow:hidden!important}'+
     '#appDateTime .pdk-festival-video{display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:cover!important;object-position:center center!important;transform-origin:center center!important;visibility:visible!important;opacity:0!important;z-index:1!important}'+
    '#appDateTime.pdk-video-ready .pdk-festival-video{opacity:1!important}'+
    '#appDateTime .pdk-festival-scene{display:none!important}'+
    '#appDateTime.pdk-video-ready .pdk-festival-scene{display:none!important}'+
    '#appDateTime .app-datetime-date,#appDateTime .app-datetime-clock{position:relative!important;z-index:4!important}';
  (document.head||document.documentElement).appendChild(style);
})();

/* Date & Time special-day label: restrained overlay that keeps festival footage visible. */
(function(){
  if(document.getElementById('pdk-date-time-special-day-label-v1')) return;
  const style=document.createElement('style');
  style.id='pdk-date-time-special-day-label-v1';
  style.textContent=[
    '#appDateTime{--pdk-special-label-bg:rgba(4,15,27,.68)}',
    '#appDateTime #appHolidayValue{position:absolute!important;z-index:6!important;left:50%!important;bottom:9px!important;transform:translateX(-50%)!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;width:max-content!important;max-width:min(82%,520px)!important;min-height:23px!important;padding:4px 11px!important;box-sizing:border-box!important;border:1px solid rgba(239,202,128,.52)!important;border-radius:999px!important;background:var(--pdk-special-label-bg)!important;color:#ffe4ad!important;font-size:clamp(9px,1.15vw,12px)!important;font-weight:750!important;line-height:1.25!important;letter-spacing:.025em!important;text-align:center!important;text-shadow:0 1px 3px rgba(0,0,0,.9)!important;box-shadow:0 3px 12px rgba(0,0,0,.18)!important;white-space:normal!important;overflow-wrap:anywhere!important;backdrop-filter:blur(5px)!important;-webkit-backdrop-filter:blur(5px)!important}',
    '#appDateTime #appHolidayValue::before{content:"✦";flex:0 0 auto;color:#f2c978;font-size:11px}',
    '#appDateTime #appHolidayValue[hidden]{display:none!important}',
    '#appDateTime #appHolidayValue.is-special{border-color:rgba(239,202,128,.62)!important}',
    '@media(max-width:520px){#appDateTime #appHolidayValue{bottom:6px!important;max-width:88%!important;padding:3px 8px!important;font-size:9px!important}}'
  ].join('');
  (document.head||document.documentElement).appendChild(style);
})();

/* Mobile Date/Time hierarchy and compact bottom-left menu button. */
(function(){
  function applyDateTimeHeaderLayout(){
    const card=document.getElementById('appDateTime');
    const menu=document.getElementById('openMenu');
    if(!card) return;
    const header=card.closest('header')||card.parentElement;
    if(header){
      header.style.setProperty('position','fixed','important');
      header.style.setProperty('top','0','important');
      header.style.setProperty('left','0','important');
      header.style.setProperty('right','0','important');
      header.style.setProperty('width','100%','important');
      header.style.setProperty('max-width','100vw','important');
      header.style.setProperty('z-index','10060','important');
      header.style.setProperty('box-sizing','border-box','important');
      header.style.setProperty('isolation','isolate','important');
      header.style.setProperty('margin','0','important');
    }
    const date=card.querySelector('.app-datetime-date');
    const clock=card.querySelector('.app-datetime-clock');
    if(date){
      date.style.setProperty('display','flex','important');
      date.style.setProperty('flex-direction','column','important');
      date.style.setProperty('align-items','flex-start','important');
      date.style.setProperty('gap','2px','important');
      date.style.setProperty('min-width','0','important');
      date.style.setProperty('max-width','48%','important');
      date.querySelectorAll('.app-datetime-caption').forEach(el=>{
        el.style.setProperty('font-size','10px','important');
        el.style.setProperty('line-height','1.1','important');
        el.style.setProperty('letter-spacing','.12em','important');
      });
      date.querySelectorAll('*').forEach(el=>{
        if(!el.classList.contains('app-datetime-caption')){
          el.style.setProperty('font-size','clamp(13px,2.6vw,18px)','important');
          el.style.setProperty('line-height','1.2','important');
          el.style.setProperty('white-space','nowrap','important');
        }
      });
    }
    if(clock){
      clock.style.setProperty('max-width','48%','important');
      clock.style.setProperty('text-align','right','important');
    }
    if(menu){
      menu.style.setProperty('position','absolute','important');
      menu.style.setProperty('left','9px','important');
      menu.style.setProperty('right','auto','important');
      menu.style.setProperty('top','auto','important');
      menu.style.setProperty('bottom','7px','important');
      menu.style.setProperty('width','42px','important');
      menu.style.setProperty('height','36px','important');
      menu.style.setProperty('min-height','36px','important');
      menu.style.setProperty('max-width','42px','important');
      menu.style.setProperty('border-radius','10px','important');
      menu.style.setProperty('display','flex','important');
      menu.style.setProperty('align-items','center','important');
      menu.style.setProperty('justify-content','center','important');
      menu.style.setProperty('padding','0','important');
      menu.style.setProperty('background','rgba(3,15,27,.82)','important');
      menu.style.setProperty('border','1px solid rgba(239,202,128,.48)','important');
      menu.style.setProperty('z-index','12','important');
      menu.style.setProperty('box-shadow','0 2px 9px rgba(0,0,0,.28)','important');
    }
    card.style.setProperty('padding-bottom','48px','important');
  }
  applyDateTimeHeaderLayout();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',applyDateTimeHeaderLayout);
  const observer=new MutationObserver(applyDateTimeHeaderLayout);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',applyDateTimeHeaderLayout,{passive:true});
})();

/* Compact month cards for a clean year-at-a-glance festival calendar. */
(function(){
  if(document.getElementById('pdk-festival-calendar-compact-v1')) return;
  const style=document.createElement('style');
  style.id='pdk-festival-calendar-compact-v1';
  style.textContent=[
    '.pdk-festival-calendar .pdk-fc-months{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;align-items:start!important}',
    '.pdk-festival-calendar .pdk-fc-month{min-width:0!important;padding:12px!important;margin:0!important;border-radius:14px!important}',
    '.pdk-festival-calendar .pdk-fc-month>h3{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:6px!important;margin:0 0 8px!important;font-size:14px!important;line-height:1.25!important}',
    '.pdk-festival-calendar .pdk-fc-month>h3 small{font-size:10px!important;white-space:nowrap!important}',
    '.pdk-festival-calendar .pdk-fc-week,.pdk-festival-calendar .pdk-fc-days{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:4px!important}',
    '.pdk-festival-calendar .pdk-fc-week{margin-bottom:4px!important}',
    '.pdk-festival-calendar .pdk-fc-week>span{min-width:0!important;height:20px!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:10px!important;font-weight:700!important}',
    '.pdk-festival-calendar .pdk-fc-day,.pdk-festival-calendar .pdk-fc-empty{box-sizing:border-box!important;min-width:0!important;width:100%!important;height:36px!important;min-height:36px!important;max-height:36px!important;padding:0!important;border-radius:8px!important;font-size:12px!important;line-height:1!important}',
    '.pdk-festival-calendar .pdk-fc-day{position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important}',
    '.pdk-festival-calendar .pdk-fc-mark{width:5px!important;height:5px!important;min-width:5px!important;position:absolute!important;bottom:4px!important;left:50%!important;transform:translateX(-50%)!important}',
    '.pdk-festival-calendar .pdk-fc-head h2{font-size:18px!important}',
    '.pdk-festival-calendar .pdk-fc-summary{gap:8px!important}',
    '@media(max-width:560px){.pdk-festival-calendar .pdk-fc-months{grid-template-columns:minmax(0,1fr)!important;gap:9px!important}.pdk-festival-calendar .pdk-fc-month{padding:10px!important}.pdk-festival-calendar .pdk-fc-day,.pdk-festival-calendar .pdk-fc-empty{height:38px!important;min-height:38px!important;max-height:38px!important;font-size:12px!important}}',
    '@media(min-width:561px) and (max-width:900px){.pdk-festival-calendar .pdk-fc-months{grid-template-columns:repeat(2,minmax(0,1fr))!important}.pdk-festival-calendar .pdk-fc-day,.pdk-festival-calendar .pdk-fc-empty{height:34px!important;min-height:34px!important;max-height:34px!important}}'
  ].join('');
  (document.head||document.documentElement).appendChild(style);
})();

/* Keep the navigation drawer above the Date & Time banner on mobile. */
(function(){
  if(document.getElementById('pdk-header-drawer-layer-fix-v1')) return;
  const style=document.createElement('style');
  style.id='pdk-header-drawer-layer-fix-v1';
  style.textContent=[
    'header.top.brand-header,header.brand-header,.brand-header{z-index:20!important;isolation:auto!important}',
    'header.top.brand-header #appDateTime,header.brand-header #appDateTime,.brand-header #appDateTime{z-index:1!important}',
    '#openMenu{z-index:25!important}',
    '#sidebar,#sideMenu,#side-menu,.sidebar,.side-menu,.side-drawer,.menu-drawer,.nav-drawer,.navigation-drawer,.offcanvas,.drawer,[role="dialog"]{z-index:10050!important}',
    '.sidebar-backdrop,.side-menu-backdrop,.menu-backdrop,.drawer-backdrop,.offcanvas-backdrop{z-index:10040!important}',
    '@media(max-width:700px){header.top.brand-header,header.brand-header,.brand-header{max-width:100vw!important}}'
  ].join('');
  (document.head||document.documentElement).appendChild(style);
})();

/* Pin the Date & Time header to the very top of the mobile viewport. */
(function(){
  if(document.getElementById('pdk-header-fixed-top-v2')) return;
  const style=document.createElement('style');
  style.id='pdk-header-fixed-top-v2';
  style.textContent=[
    'header.top.brand-header,header.brand-header,.brand-header{position:fixed!important;top:0!important;left:0!important;right:0!important;width:100%!important;max-width:100vw!important;margin:0!important;z-index:10060!important;box-sizing:border-box!important;transform:none!important}',
    'header.top.brand-header #appDateTime,header.brand-header #appDateTime,.brand-header #appDateTime{position:relative!important;z-index:1!important}',
    '#openMenu{z-index:10070!important}',
    '@media(max-width:700px){header.top.brand-header,header.brand-header,.brand-header{inset:0 0 auto 0!important}}'
  ].join('');
  (document.head||document.documentElement).appendChild(style);
  function pinHeader(){
    const h=document.querySelector('header.top.brand-header,header.brand-header,.brand-header');
    if(!h)return;
    h.style.setProperty('position','fixed','important');
    h.style.setProperty('top','0','important');
    h.style.setProperty('left','0','important');
    h.style.setProperty('right','0','important');
    h.style.setProperty('width','100%','important');
    h.style.setProperty('z-index','10060','important');
    h.style.setProperty('transform','none','important');
  }
  pinHeader();
  new MutationObserver(pinHeader).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',pinHeader,{passive:true});
})();

/* Refined Date, Thailand Time, holiday and alarm alignment over the header video. */
(function(){
  if(document.getElementById('pdk-datetime-balanced-layout-v1')) return;
  const style=document.createElement('style');
  style.id='pdk-datetime-balanced-layout-v1';
  style.textContent=[
    '#appDateTime{position:relative!important;display:block!important;box-sizing:border-box!important;width:100%!important;min-height:164px!important;height:clamp(164px,27vw,220px)!important;padding:0!important;overflow:hidden!important}',
    '#appDateTime .app-datetime-date{position:absolute!important;top:22px!important;left:18px!important;right:auto!important;width:calc(50% - 28px)!important;max-width:calc(50% - 28px)!important;min-width:0!important;margin:0!important;display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:3px!important;text-align:left!important;z-index:6!important}',
    '#appDateTime .app-datetime-date .app-datetime-caption{font-size:10px!important;line-height:1.15!important;letter-spacing:.14em!important}',
    '#appDateTime .app-datetime-date :not(.app-datetime-caption){font-size:clamp(15px,3vw,22px)!important;line-height:1.15!important;white-space:nowrap!important}',
    '#appDateTime .app-datetime-clock{position:absolute!important;top:22px!important;left:auto!important;right:68px!important;width:calc(50% - 92px)!important;max-width:calc(50% - 92px)!important;min-width:112px!important;margin:0!important;display:flex!important;flex-direction:column!important;align-items:flex-end!important;gap:3px!important;text-align:right!important;z-index:6!important}',
    '#appDateTime .app-datetime-clock .app-datetime-caption{font-size:10px!important;line-height:1.15!important;letter-spacing:.12em!important;white-space:nowrap!important}',
    '#appDateTime .app-datetime-clock :not(.app-datetime-caption){font-size:clamp(15px,3vw,22px)!important;line-height:1.15!important;white-space:nowrap!important}',
    '#ownerEmergencyAlarmHeader{position:absolute!important;top:64px!important;right:14px!important;left:auto!important;bottom:auto!important;z-index:9!important;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;margin:0!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important}',
    '#appDateTime #appHolidayValue{position:absolute!important;left:50%!important;right:auto!important;bottom:48px!important;top:auto!important;transform:translateX(-50%)!important;width:max-content!important;max-width:calc(100% - 118px)!important;box-sizing:border-box!important;margin:0!important;z-index:7!important;padding:4px 10px!important;font-size:10px!important;line-height:1.25!important;text-align:center!important;white-space:normal!important}',
    '#openMenu{position:absolute!important;left:12px!important;right:auto!important;top:auto!important;bottom:7px!important;z-index:10!important;width:40px!important;height:34px!important;min-height:34px!important;border-radius:9px!important}',
    '#appDateTime .app-datetime-date,#appDateTime .app-datetime-clock{color:#fff!important;text-shadow:0 2px 5px rgba(0,0,0,.85)!important}',
    '@media(max-width:520px){#appDateTime{height:164px!important;min-height:164px!important}#appDateTime .app-datetime-date{top:18px!important;left:14px!important;width:calc(50% - 20px)!important;max-width:calc(50% - 20px)!important}#appDateTime .app-datetime-clock{top:18px!important;right:60px!important;width:calc(50% - 78px)!important;max-width:calc(50% - 78px)!important;min-width:104px!important}#ownerEmergencyAlarmHeader{top:60px!important;right:10px!important;width:40px!important;height:40px!important;min-width:40px!important;min-height:40px!important}#appDateTime #appHolidayValue{bottom:46px!important;max-width:calc(100% - 104px)!important;font-size:9px!important;padding:3px 8px!important}#openMenu{left:10px!important;bottom:7px!important;width:38px!important;height:32px!important;min-height:32px!important}}',
    '@media(max-width:380px){#appDateTime .app-datetime-date{top:16px!important;left:11px!important}#appDateTime .app-datetime-clock{top:16px!important;right:54px!important;min-width:96px!important}#appDateTime .app-datetime-date :not(.app-datetime-caption),#appDateTime .app-datetime-clock :not(.app-datetime-caption){font-size:14px!important}#appDateTime .app-datetime-date .app-datetime-caption,#appDateTime .app-datetime-clock .app-datetime-caption{font-size:9px!important}#ownerEmergencyAlarmHeader{right:8px!important;width:36px!important;height:36px!important;min-width:36px!important;min-height:36px!important}}'
  ].join('');
  (document.head||document.documentElement).appendChild(style);
})();
