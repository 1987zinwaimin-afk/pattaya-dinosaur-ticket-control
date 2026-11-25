import { del } from '@vercel/blob';

const SUPABASE_URL = 'https://tlefnqzpilajeuyysujb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7A7k-Dh3I7r3Gxk7EaakOQ_GLDon5wm';

function send(res, status, body) {
  return res.status(status).json(body);
}

function assertFestivalBlobUrl(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('Invalid video storage URL.'); }
  if (url.protocol !== 'https:' ||
      !url.hostname.endsWith('.public.blob.vercel-storage.com') ||
      !url.pathname.startsWith('/festival-videos/')) {
    throw new Error('This file is not in the Festival Video Library.');
  }
  return url.toString();
}

async function requireOwner(accessToken) {
  if (!accessToken) throw new Error('Owner sign-in is required.');
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + accessToken };
  const userResponse = await fetch(SUPABASE_URL + '/auth/v1/user', { headers });
  if (!userResponse.ok) throw new Error('Your sign-in session is invalid. Please sign in again.');
  const user = await userResponse.json();
  const profileResponse = await fetch(
    SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=role,is_archived',
    { headers }
  );
  if (!profileResponse.ok) throw new Error('Could not verify Owner permissions.');
  const profiles = await profileResponse.json();
  if (!profiles[0] || profiles[0].role !== 'owner' || profiles[0].is_archived) {
    throw new Error('Only an active Owner can delete festival videos.');
  }
  return { user, headers };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const accessToken = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '');
    const { headers } = await requireOwner(accessToken);

    if (body.action === 'deleteBlob') {
      const blobUrl = assertFestivalBlobUrl(body.url);
      await del(blobUrl);
      return send(res, 200, { success: true, storageDeleted: true });
    }

    if (body.action !== 'delete' || !body.id) {
      return send(res, 400, { error: 'A valid festival video id is required.' });
    }

    const rowResponse = await fetch(
      SUPABASE_URL + '/rest/v1/festival_media?id=eq.' + encodeURIComponent(body.id) + '&select=id,blob_url',
      { headers }
    );
    if (!rowResponse.ok) throw new Error('Could not find the festival video record.');
    const rows = await rowResponse.json();
    if (!rows[0]) return send(res, 404, { error: 'This festival video was already deleted.' });

    const blobUrl = assertFestivalBlobUrl(rows[0].blob_url);
    // Delete the cloud object first. Keep the database row if cloud deletion fails,
    // so the Owner can retry instead of leaving an untracked cloud file.
    await del(blobUrl);

    const deleteResponse = await fetch(
      SUPABASE_URL + '/rest/v1/festival_media?id=eq.' + encodeURIComponent(body.id),
      { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
    );
    if (!deleteResponse.ok) {
      throw new Error('The cloud video was deleted, but the database row could not be removed. Retry Delete to finish cleanup.');
    }
    return send(res, 200, { success: true, storageDeleted: true, databaseDeleted: true });
  } catch (error) {
    return send(res, 400, { error: error instanceof Error ? error.message : 'Could not delete festival video.' });
  }
}
