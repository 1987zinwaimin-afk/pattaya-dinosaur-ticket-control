-- Account profile fields for Owner and Staff, with Staff ID-scoped self-service access.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS social_platform text,
  ADD COLUMN IF NOT EXISTS social_link text;

ALTER TABLE public.staff_directory
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS social_platform text,
  ADD COLUMN IF NOT EXISTS social_link text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.staff_profile_details (
  staff_id text PRIMARY KEY REFERENCES public.staff_directory(staff_id) ON UPDATE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  birth_date date,
  phone text,
  social_platform text,
  social_link text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_profile_details_phone_len CHECK (phone IS NULL OR char_length(btrim(phone)) <= 40),
  CONSTRAINT staff_profile_details_social_platform_len CHECK (social_platform IS NULL OR char_length(btrim(social_platform)) <= 40),
  CONSTRAINT staff_profile_details_social_link_valid CHECK (
    social_link IS NULL OR (char_length(btrim(social_link)) <= 500 AND social_link ~* '^https?://')
  ),
  CONSTRAINT staff_profile_details_notes_len CHECK (notes IS NULL OR char_length(notes) <= 500)
);

ALTER TABLE public.staff_profile_details ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.staff_profile_details TO authenticated;

DROP POLICY IF EXISTS "Owners manage staff profile details" ON public.staff_profile_details;
CREATE POLICY "Owners manage staff profile details"
  ON public.staff_profile_details FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'owner'
        AND COALESCE(p.is_archived, false) = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'owner'
        AND COALESCE(p.is_archived, false) = false
    )
  );

DROP POLICY IF EXISTS "Staff read own profile details" ON public.staff_profile_details;
CREATE POLICY "Staff read own profile details"
  ON public.staff_profile_details FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'staff'
        AND COALESCE(p.is_archived, false) = false
        AND upper(btrim(p.staff_id)) = upper(btrim(staff_profile_details.staff_id))
    )
  );

DROP POLICY IF EXISTS "Staff create own profile details" ON public.staff_profile_details;
CREATE POLICY "Staff create own profile details"
  ON public.staff_profile_details FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'staff'
        AND COALESCE(p.is_archived, false) = false
        AND upper(btrim(p.staff_id)) = upper(btrim(staff_profile_details.staff_id))
    )
  );

DROP POLICY IF EXISTS "Staff update own profile details" ON public.staff_profile_details;
CREATE POLICY "Staff update own profile details"
  ON public.staff_profile_details FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'staff'
        AND COALESCE(p.is_archived, false) = false
        AND upper(btrim(p.staff_id)) = upper(btrim(staff_profile_details.staff_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'staff'
        AND COALESCE(p.is_archived, false) = false
        AND upper(btrim(p.staff_id)) = upper(btrim(staff_profile_details.staff_id))
    )
  );

CREATE OR REPLACE FUNCTION public.sync_staff_profile_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.staff_directory
     SET display_name = NEW.display_name,
         birth_date = NEW.birth_date,
         phone = NEW.phone,
         social_platform = NEW.social_platform,
         social_link = NEW.social_link,
         notes = NEW.notes,
         updated_at = now()
   WHERE upper(btrim(staff_id)) = upper(btrim(NEW.staff_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff directory record was not found for this Staff ID';
  END IF;

  UPDATE public.profiles
     SET display_name = NEW.display_name
   WHERE role = 'staff'
     AND upper(btrim(staff_id)) = upper(btrim(NEW.staff_id));

  UPDATE public.staff_login_activity
     SET display_name = NEW.display_name,
         updated_at = now()
   WHERE upper(btrim(staff_id)) = upper(btrim(NEW.staff_id));

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_staff_profile_details() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_staff_profile_details_after_write ON public.staff_profile_details;
CREATE TRIGGER sync_staff_profile_details_after_write
  AFTER INSERT OR UPDATE OF display_name, birth_date, phone, social_platform, social_link, notes
  ON public.staff_profile_details
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_staff_profile_details();

COMMENT ON TABLE public.staff_profile_details IS
  'Private-to-owner and self-editable profile/contact details for each permanent Staff ID.';
COMMENT ON COLUMN public.profiles.birth_date IS 'Owner account date of birth.';
COMMENT ON COLUMN public.profiles.phone IS 'Owner account contact phone number.';
COMMENT ON COLUMN public.profiles.social_platform IS 'Owner account preferred social platform.';
COMMENT ON COLUMN public.profiles.social_link IS 'Owner account social profile URL.';
