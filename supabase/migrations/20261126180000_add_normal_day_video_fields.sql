alter table public.calendar_day_messages
  add column if not exists video_path text,
  add column if not exists video_url text,
  add column if not exists video_content_type text,
  add column if not exists video_file_size_bytes bigint;

alter table public.calendar_day_messages
  drop constraint if exists calendar_day_messages_video_source_check;

alter table public.calendar_day_messages
  add constraint calendar_day_messages_video_source_check
  check (
    (video_path is null or length(trim(video_path)) > 0)
    and
    (video_url is null or (video_url ~* '^https?://' and length(video_url) <= 2048))
  );

comment on column public.calendar_day_messages.video_path is 'Optional private festival-videos bucket object for normal-day Date & Time video';
comment on column public.calendar_day_messages.video_url is 'Optional direct HTTPS/HTTP video URL for normal-day Date & Time video';