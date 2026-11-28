-- Allow a Normal-day notice to contain only an attached video or direct video URL.
-- Keep the existing 1-600 character requirement whenever notice text is provided.
ALTER TABLE public.calendar_day_messages
  DROP CONSTRAINT IF EXISTS calendar_day_messages_message_check;

ALTER TABLE public.calendar_day_messages
  ADD CONSTRAINT calendar_day_messages_message_check
  CHECK (
    (char_length(btrim(message)) BETWEEN 1 AND 600)
    OR (btrim(message) = '' AND (video_path IS NOT NULL OR video_url IS NOT NULL))
  );
