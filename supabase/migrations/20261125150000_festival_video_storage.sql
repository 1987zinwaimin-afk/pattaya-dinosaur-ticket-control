-- Festival video storage and owner-only media management.
-- This migration is additive: it does not modify authentication, tickets, sales, staff or event records.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'festival-videos',
  'festival-videos',
  false,
  524288000,
  array['video/mp4','video/webm','video/quicktime']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 524288000,
    allowed_mime_types = array['video/mp4','video/webm','video/quicktime']::text[];

-- One current video per exact festival name and date. The previous table is already
-- present in the live project; the unique index enables safe insert/update behavior.
create unique index if not exists festival_media_date_name_uidx
  on public.festival_media (festival_date, festival_name);

drop policy if exists "Festival videos readable by active team" on storage.objects;
create policy "Festival videos readable by active team"
on storage.objects for select to authenticated
using (
  bucket_id = 'festival-videos'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','staff')
      and coalesce(p.is_archived,false) = false
  )
);

drop policy if exists "Owners upload festival videos" on storage.objects;
create policy "Owners upload festival videos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'festival-videos'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'owner'
      and coalesce(p.is_archived,false) = false
  )
);

drop policy if exists "Owners delete festival videos" on storage.objects;
create policy "Owners delete festival videos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'festival-videos'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'owner'
      and coalesce(p.is_archived,false) = false
  )
);

drop policy if exists "Owners update festival videos" on storage.objects;
create policy "Owners update festival videos"
on storage.objects for update to authenticated
using (
  bucket_id = 'festival-videos'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'owner'
      and coalesce(p.is_archived,false) = false
  )
)
with check (
  bucket_id = 'festival-videos'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'owner'
      and coalesce(p.is_archived,false) = false
  )
);
