-- Require complete Staff login details and keep My Profile in sync.
CREATE OR REPLACE FUNCTION public.claim_staff_identity_with_profile(
  p_staff_id text,
  p_display_name text,
  p_birth_date date,
  p_department text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_staff_id text;
  v_saved_birth date;
  v_department text := lower(btrim(coalesce(p_department, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in is required';
  END IF;
  IF p_birth_date IS NULL THEN
    RAISE EXCEPTION 'Date of birth is required';
  END IF;
  IF p_birth_date > current_date THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future';
  END IF;
  IF v_department NOT IN ('sale', 'entry', 'playing', 'event') THEN
    RAISE EXCEPTION 'Please select one valid Staff Department';
  END IF;

  SELECT coalesce(d.birth_date, x.birth_date)
    INTO v_saved_birth
    FROM public.staff_directory d
    LEFT JOIN public.staff_profile_details x
      ON upper(btrim(x.staff_id)) = upper(btrim(d.staff_id))
   WHERE upper(btrim(d.staff_id)) = upper(btrim(p_staff_id))
   LIMIT 1;
  IF v_saved_birth IS NOT NULL AND v_saved_birth <> p_birth_date THEN
    RAISE EXCEPTION 'Date of Birth does not match the saved Staff profile. Please contact Owner if it needs correction.';
  END IF;

  v_staff_id := public.claim_staff_identity(p_staff_id, p_display_name, v_department);

  UPDATE public.staff_directory
     SET department = v_department,
         birth_date = p_birth_date,
         updated_at = now()
   WHERE upper(btrim(staff_id)) = upper(btrim(v_staff_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff directory record was not found';
  END IF;

  -- Create the details row from the directory without erasing existing contact fields.
  INSERT INTO public.staff_profile_details (
    staff_id, display_name, birth_date, phone, social_platform, social_link, notes
  )
  SELECT
    d.staff_id, d.display_name, d.birth_date, d.phone, d.social_platform, d.social_link, d.notes
  FROM public.staff_directory d
  WHERE upper(btrim(d.staff_id)) = upper(btrim(v_staff_id))
  ON CONFLICT (staff_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        birth_date = EXCLUDED.birth_date,
        updated_at = now();

  RETURN v_staff_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_staff_profile(
  p_display_name text,
  p_birth_date date,
  p_department text,
  p_phone text DEFAULT NULL,
  p_social_platform text DEFAULT NULL,
  p_social_link text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_staff_id text;
  v_department text := lower(btrim(coalesce(p_department, '')));
  v_name text := btrim(coalesce(p_display_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_platform text := nullif(btrim(coalesce(p_social_platform, '')), '');
  v_social text := nullif(btrim(coalesce(p_social_link, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
BEGIN
  SELECT p.staff_id
    INTO v_staff_id
    FROM public.profiles p
   WHERE p.id = auth.uid()
     AND p.role = 'staff'
     AND coalesce(p.is_archived, false) = false
   LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Verified Staff account is required';
  END IF;
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'Please enter a valid Staff name';
  END IF;
  IF p_birth_date IS NULL OR p_birth_date > current_date THEN
    RAISE EXCEPTION 'Please enter a valid Date of Birth';
  END IF;
  IF v_department NOT IN ('sale', 'entry', 'playing', 'event') THEN
    RAISE EXCEPTION 'Please select one valid Staff Department';
  END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Phone number must be 40 characters or fewer';
  END IF;
  IF v_platform IS NOT NULL AND char_length(v_platform) > 40 THEN
    RAISE EXCEPTION 'Social platform must be 40 characters or fewer';
  END IF;
  IF v_social IS NOT NULL AND (char_length(v_social) > 500 OR v_social !~* '^https?://') THEN
    RAISE EXCEPTION 'Enter a valid social profile URL';
  END IF;
  IF v_notes IS NOT NULL AND char_length(v_notes) > 500 THEN
    RAISE EXCEPTION 'Additional information must be 500 characters or fewer';
  END IF;

  UPDATE public.staff_profile_details
     SET display_name = v_name,
         birth_date = p_birth_date,
         phone = v_phone,
         social_platform = v_platform,
         social_link = v_social,
         notes = v_notes,
         updated_at = now()
   WHERE upper(btrim(staff_id)) = upper(btrim(v_staff_id));

  IF NOT FOUND THEN
    INSERT INTO public.staff_profile_details (
      staff_id, display_name, birth_date, phone, social_platform, social_link, notes
    )
    VALUES (v_staff_id, v_name, p_birth_date, v_phone, v_platform, v_social, v_notes);
  END IF;

  UPDATE public.staff_directory
     SET department = v_department,
         updated_at = now()
   WHERE upper(btrim(staff_id)) = upper(btrim(v_staff_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff directory record was not found';
  END IF;

  RETURN v_staff_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_staff_identity_with_profile(text, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_my_staff_profile(text, date, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_staff_identity_with_profile(text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_staff_profile(text, date, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.claim_staff_identity_with_profile(text, text, date, text) IS
  'Requires Staff ID, registered name, date of birth and one exact department before creating/updating a Staff login profile.';
COMMENT ON FUNCTION public.save_my_staff_profile(text, date, text, text, text, text, text) IS
  'Allows a verified Staff account to edit its own name, birthday, department and contact details.';
