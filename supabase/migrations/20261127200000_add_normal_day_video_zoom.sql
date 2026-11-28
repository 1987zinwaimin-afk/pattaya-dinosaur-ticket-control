-- Persist the display zoom for each Normal-day Date & Time video.
ALTER TABLE public.calendar_day_messages
  ADD COLUMN IF NOT EXISTS video_zoom integer NOT NULL DEFAULT 100;

ALTER TABLE public.calendar_day_messages
  DROP CONSTRAINT IF EXISTS calendar_day_messages_video_zoom_check;

ALTER TABLE public.calendar_day_messages
  ADD CONSTRAINT calendar_day_messages_video_zoom_check
  CHECK (video_zoom BETWEEN 60 AND 150);
