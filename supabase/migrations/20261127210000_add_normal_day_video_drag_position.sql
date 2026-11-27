-- Persist touch-adjusted framing for Normal-day Date & Time videos.
ALTER TABLE public.calendar_day_messages
  ADD COLUMN IF NOT EXISTS video_position_x double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_position_y double precision NOT NULL DEFAULT 0;

ALTER TABLE public.calendar_day_messages
  DROP CONSTRAINT IF EXISTS calendar_day_messages_video_zoom_check,
  DROP CONSTRAINT IF EXISTS calendar_day_messages_video_position_x_check,
  DROP CONSTRAINT IF EXISTS calendar_day_messages_video_position_y_check;

ALTER TABLE public.calendar_day_messages
  ADD CONSTRAINT calendar_day_messages_video_zoom_check
  CHECK (video_zoom BETWEEN 50 AND 200);
