-- Video-only Normal-day notices do not require a visible title.
ALTER TABLE public.calendar_day_messages
  ALTER COLUMN title DROP NOT NULL,
  ALTER COLUMN title SET DEFAULT '';

ALTER TABLE public.calendar_day_messages
  DROP CONSTRAINT IF EXISTS calendar_day_messages_title_check;

ALTER TABLE public.calendar_day_messages
  ADD CONSTRAINT calendar_day_messages_title_check
  CHECK (
    (char_length(btrim(title)) BETWEEN 1 AND 120)
    OR (btrim(title) = '' AND (video_path IS NOT NULL OR video_url IS NOT NULL))
  );
