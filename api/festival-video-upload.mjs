import { handleUpload } from '@vercel/blob/client';

const SUPABASE_URL = 'https://tlefnqzpilajeuyysujb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7A7k-Dh3I7r3Gxk7EaakOQ_GLDon5wm';
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

async function requireOwner(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('Owner sign-in is required.');
  }
  const userResponse = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + accessToken }
  });
  if (!userResponse.ok) throw new Error('Your sign-in session is invalid. Please sign in again.');
  const user = await userResponse.json();
  const profileResponse = await fetch(
    SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=role,is_archived',
    { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + accessToken } }
  );
  if (!profileResponse.ok) throw new Error('Could not verify Owner permissions.');
  const profiles = await profileResponse.json();
  if (!profiles[0] || profiles[0].role !== 'owner' || profiles[0].is_archived) {
    throw new Error('Only an active Owner can upload festival videos.');
  }
  return user;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object') throw new Error('Invalid upload request.');
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload = {};
        try { payload = JSON.parse(clientPayload || '{}'); } catch (_) {}
        const user = await requireOwner(payload.accessToken);
        if (typeof pathname !== 'string' || !pathname.startsWith('festival-videos/')) {
          throw new Error('Invalid festival video destination.');
        }
        return {
          allowedContentTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id, purpose: 'pdk-festival-video' })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Metadata is written by the authenticated browser only after the upload succeeds.
        // The callback intentionally stores no duplicate file or metadata copy.
        if (!blob?.url || !tokenPayload) throw new Error('Festival video upload could not be verified.');
      }
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Video upload failed.' });
  }
}
