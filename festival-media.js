(function () {
  if (window.__pdkFestivalMediaBooted) return;
  window.__pdkFestivalMediaBooted = true;

  const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
  let mediaItems = [];
  let clientModulePromise = null;
  let loadPromise = null;
  const video = document.querySelector('#appDateTime .pdk-festival-video');
  const videoSource = video?.querySelector('source') || null;
  const defaultVideoSource = videoSource?.getAttribute('src') || video?.getAttribute('src') || '';

  function getBangkokParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const value = type => parts.find(part => part.type === type)?.value || '';
    return { date: value('year') + '-' + value('month') + '-' + value('day'), time: value('hour') + ':' + value('minute') };
  }

  function addMediaToCalendarLookup() {
    window.__pdkThailandFestivalLookup = window.__pdkThailandFestivalLookup || {};
    mediaItems.forEach(item => {
      const date = item.festival_date;
      const events = window.__pdkThailandFestivalLookup[date] || (window.__pdkThailandFestivalLookup[date] = []);
      if (!events.some(event => event.title === item.festival_name)) {
        events.unshift({
          date,
          title: item.festival_name,
          desc: 'Festival video uploaded by the Owner.',
          kind: item.festival_kind || 'festival',
          theme: item.festival_theme || 'national',
          icon: '🎬',
          status: 'cultural'
        });
      }
    });
  }

  function setVideoSource(url) {
    if (!video || !url) return;
    const active = video.dataset.pdkFestivalVideoUrl || '';
    if (active === url) return;
    video.dataset.pdkFestivalVideoUrl = url;
    if (videoSource) videoSource.setAttribute('src', url);
    else video.setAttribute('src', url);
    video.load();
    const play = video.play();
    if (play && typeof play.catch === 'function') play.catch(() => {});
  }

  function restoreDefaultVideo() {
    if (!video || !defaultVideoSource) return;
    if ((video.dataset.pdkFestivalVideoUrl || '') === '') return;
    delete video.dataset.pdkFestivalVideoUrl;
    if (videoSource) videoSource.setAttribute('src', defaultVideoSource);
    else video.setAttribute('src', defaultVideoSource);
    video.load();
    const play = video.play();
    if (play && typeof play.catch === 'function') play.catch(() => {});
  }

  function selectDateTimeVideo() {
    const preview = window.__pdkFestivalDateTimePreview || null;
    if (preview?.mediaId) return mediaItems.find(item => item.id === preview.mediaId) || null;
    const date = preview?.date || getBangkokParts().date;
    const todays = mediaItems.filter(item => item.festival_date === date)
      .sort((a, b) => String(a.display_time || '00:00').localeCompare(String(b.display_time || '00:00')));
    if (preview?.date) return todays[0] || null;
    const now = getBangkokParts().time;
    return todays.filter(item => String(item.display_time || '00:00').slice(0, 5) <= now).pop() || null;
  }

  function applyFestivalMediaToDateTime() {
    const card = document.getElementById('appDateTime');
    if (!card) return;
    const preview = window.__pdkFestivalDateTimePreview || null;
    const selected = selectDateTimeVideo();
    if (selected?.blob_url) {
      setVideoSource(selected.blob_url);
      card.dataset.festivalVideoName = selected.festival_name || '';
      const art = card.querySelector('.pdk-festival-art');
      art?.querySelectorAll('.pdk-calendar-preview-video,.pdk-calendar-preview-art,.pdk-calendar-preview-gif').forEach(node => node.remove());
    } else {
      delete card.dataset.festivalVideoName;
      restoreDefaultVideo();
    }
    const reset = document.getElementById('pdkFestivalPreviewReset');
    if (reset) reset.hidden = !preview;
  }

  async function loadFestivalMedia(force) {
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
      if (typeof sb === 'undefined' || !sb?.auth) return [];
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData?.session) {
        mediaItems = [];
        window.__pdkFestivalMediaItems = mediaItems;
        window.__pdkFestivalMediaByDate = {};
        applyFestivalMediaToDateTime();
        return [];
      }
      const { data, error } = await sb.from('festival_media')
        .select('*').order('festival_date', { ascending: true }).order('display_time', { ascending: true });
      if (error) throw error;
      mediaItems = Array.isArray(data) ? data : [];
      window.__pdkFestivalMediaItems = mediaItems;
      window.__pdkFestivalMediaByDate = mediaItems.reduce((map, item) => {
        (map[item.festival_date] || (map[item.festival_date] = [])).push(item);
        return map;
      }, {});
      addMediaToCalendarLookup();
      applyFestivalMediaToDateTime();
      return mediaItems;
    })();
    try { return await loadPromise; }
    finally { loadPromise = null; }
  }

  async function getBlobClient() {
    if (!clientModulePromise) {
      clientModulePromise = import('https://esm.sh/@vercel/blob@2.0.1/client?bundle');
    }
    return clientModulePromise;
  }

  async function callDeleteApi(payload, accessToken) {
    const response = await fetch('/api/festival-videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Cloud video deletion failed.');
    return result;
  }

  async function uploadFestivalVideo(options) {
    if (typeof sb === 'undefined' || !sb?.auth) throw new Error('Application session is not ready.');
    if (typeof currentRole !== 'undefined' && currentRole !== 'owner') throw new Error('Only Owner can upload festival videos.');
    const { date, name, kind, theme, time, file, onProgress } = options || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid festival date.');
    if (!name || !String(name).trim()) throw new Error('Enter the festival name.');
    if (!file) throw new Error('Choose a video file first.');
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) throw new Error('Upload an MP4, WebM or MOV video.');
    if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) throw new Error('Video size must be 500 MB or less.');
    const { data: sessionData } = await sb.auth.getSession();
    const session = sessionData?.session;
    if (!session?.access_token || !session.user?.id) throw new Error('Please sign in again before uploading.');

    const cleanName = String(name).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'festival';
    const extension = file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4';
    const pathname = 'festival-videos/' + date + '/' + cleanName + '-' + Date.now() + '.' + extension;
    const previous = mediaItems.find(item => item.festival_date === date && item.festival_name === String(name).trim()) || null;
    const blobClient = await getBlobClient();
    if (typeof blobClient.upload !== 'function') throw new Error('Video uploader could not be loaded. Refresh and try again.');

    const blob = await blobClient.upload(pathname, file, {
      access: 'public',
      handleUploadUrl: '/api/festival-video-upload',
      contentType: file.type,
      multipart: file.size > 25 * 1024 * 1024,
      clientPayload: JSON.stringify({ accessToken: session.access_token }),
      onUploadProgress: progress => { if (typeof onProgress === 'function') onProgress(progress); }
    });

    const row = {
      festival_date: date,
      festival_name: String(name).trim(),
      festival_kind: ['holiday', 'festival', 'religious', 'cultural'].includes(kind) ? kind : 'festival',
      festival_theme: ['national', 'royal', 'buddhist', 'loy', 'songkran', 'chinese', 'children', 'christmas', 'new-year', 'vegetarian', 'valentines'].includes(theme) ? theme : 'national',
      display_time: time || '00:00',
      timezone: 'Asia/Bangkok',
      blob_url: blob.url,
      blob_path: blob.pathname || pathname,
      content_type: file.type,
      file_size_bytes: file.size,
      created_by: session.user.id,
      updated_at: new Date().toISOString()
    };
    const { data: saved, error } = await sb.from('festival_media')
      .upsert(row, { onConflict: 'festival_date,festival_name' }).select().single();
    if (error) {
      try { await callDeleteApi({ action: 'deleteBlob', url: blob.url }, session.access_token); } catch (cleanupError) {
        console.error('Festival upload rollback needs review:', cleanupError);
      }
      throw error;
    }
    if (previous?.blob_url && previous.blob_url !== blob.url) {
      try { await callDeleteApi({ action: 'deleteBlob', url: previous.blob_url }, session.access_token); }
      catch (cleanupError) { console.warn('Previous festival video cleanup needs retry:', cleanupError); }
    }
    await loadFestivalMedia(true);
    applyFestivalMediaToDateTime();
    return saved;
  }

  async function deleteFestivalVideo(id) {
    if (typeof sb === 'undefined' || !sb?.auth) throw new Error('Application session is not ready.');
    if (typeof currentRole !== 'undefined' && currentRole !== 'owner') throw new Error('Only Owner can delete festival videos.');
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Please sign in again before deleting.');
    await callDeleteApi({ action: 'delete', id }, token);
    await loadFestivalMedia(true);
    applyFestivalMediaToDateTime();
    return true;
  }

  function setFestivalPreview(date, title, theme, mediaId) {
    window.__pdkFestivalDateTimePreview = { date, title, theme, mediaId: mediaId || null };
    const card = document.getElementById('appDateTime');
    if (card) {
      card.dataset.festivalDate = date;
      card.dataset.previewTitle = title || '';
      card.classList.add('has-festival-theme', 'is-calendar-preview');
      const holiday = document.getElementById('appHolidayValue');
      if (holiday) { holiday.textContent = title || ''; holiday.hidden = !title; holiday.classList.add('is-special'); }
    }
    applyFestivalMediaToDateTime();
  }

  function clearFestivalPreview() {
    delete window.__pdkFestivalDateTimePreview;
    const card = document.getElementById('appDateTime');
    if (card) { card.classList.remove('is-calendar-preview'); delete card.dataset.previewTitle; }
    const holiday = document.getElementById('appHolidayValue');
    if (holiday) { holiday.hidden = true; holiday.textContent = ''; holiday.classList.remove('is-special'); }
    applyFestivalMediaToDateTime();
    if (typeof updateThailandDateTime === 'function') updateThailandDateTime();
  }

  function installPreviewReset() {
    const dateColumn = document.querySelector('#appDateTime .app-datetime-date');
    if (!dateColumn || document.getElementById('pdkFestivalPreviewReset')) return;
    const button = document.createElement('button');
    button.id = 'pdkFestivalPreviewReset';
    button.type = 'button';
    button.textContent = '↩ Today';
    button.hidden = true;
    button.style.cssText = 'align-self:flex-start;margin-top:5px;padding:4px 9px;border:1px solid rgba(232,185,79,.55);border-radius:8px;background:rgba(4,22,40,.7);color:#ffe08a;font-size:10px;font-weight:800;min-height:28px';
    button.addEventListener('click', clearFestivalPreview);
    dateColumn.appendChild(button);
  }

  window.pdkLoadFestivalMedia = loadFestivalMedia;
  window.pdkUploadFestivalVideo = uploadFestivalVideo;
  window.pdkDeleteFestivalVideo = deleteFestivalVideo;
  window.pdkSetFestivalDateTimePreview = setFestivalPreview;
  window.pdkClearFestivalDateTimePreview = clearFestivalPreview;
  window.pdkApplyFestivalMediaToDateTime = applyFestivalMediaToDateTime;

  installPreviewReset();
  if (typeof sb !== 'undefined' && sb?.auth) {
    sb.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadFestivalMedia(true).catch(error => console.warn('Festival media could not be loaded:', error));
      } else {
        mediaItems = [];
        window.__pdkFestivalMediaItems = [];
        window.__pdkFestivalMediaByDate = {};
        applyFestivalMediaToDateTime();
      }
    });
    loadFestivalMedia(true).catch(error => console.warn('Festival media could not be loaded:', error));
  }
  window.setInterval(applyFestivalMediaToDateTime, 5000);
})();
