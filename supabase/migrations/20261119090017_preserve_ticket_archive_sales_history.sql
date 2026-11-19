CREATE OR REPLACE FUNCTION public.add_event_ticket_quantity(p_ticket_id uuid, p_quantity integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_staff_id text; v_new_quantity integer;
begin
 if auth.uid() is null then raise exception 'Please sign in again.'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>100000 then raise exception 'Enter a valid ticket quantity (1–100000).'; end if;
 select p.staff_id into v_staff_id from public.profiles p where p.id=auth.uid() and p.role='staff' and coalesce(p.is_archived,false)=false;
 if v_staff_id is null then raise exception 'This Event Staff account is not active.'; end if;
 update public.tickets t
 set quantity=coalesce(t.quantity,0)+p_quantity,updated_by=auth.uid(),updated_at=now()
 where t.id=p_ticket_id and t.department='event' and t.location like 'event:%'
   and coalesce(t.is_archived,false)=false
   and exists (select 1 from public.event_location_sessions s where t.location='event:'||s.id::text and s.staff_id=v_staff_id and s.created_by=auth.uid() and coalesce(s.is_archived,false)=false and s.event_history_deleted_at is null);
 if not found then raise exception 'Ticket does not belong to your active Event Location or is archived. Refresh and try again.'; end if;
 select quantity into v_new_quantity from public.tickets where id=p_ticket_id;
 return v_new_quantity;
end;
$function$;

CREATE OR REPLACE FUNCTION private.capture_daily_ticket_sales()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_business_date date;
  v_rollover jsonb;
  v_saved integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pattaya-dinosaur-daily-ticket-rollover'));
  LOOP
    v_rollover := private.archive_and_clear_daily_ticket_sales();
    v_business_date := (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
    EXIT WHEN (v_rollover->>'business_date')::date = v_business_date - 1;
  END LOOP;
  INSERT INTO public.ticket_daily_sales
    (business_date, ticket_id, department, ticket_name, unit_price, quantity, total_amount)
  SELECT
    v_business_date, t.id, t.department, t.name, t.price, coalesce(t.quantity, 0),
    coalesce(t.quantity, 0) * coalesce(t.price, 0)
  FROM public.tickets t
  WHERE NOT coalesce(t.is_archived,false)
     OR (t.archived_at IS NOT NULL AND (t.archived_at AT TIME ZONE 'Asia/Bangkok')::date = v_business_date)
  ON CONFLICT (business_date, ticket_id) DO UPDATE
    SET department = EXCLUDED.department,
        ticket_name = EXCLUDED.ticket_name,
        unit_price = EXCLUDED.unit_price,
        quantity = EXCLUDED.quantity,
        total_amount = EXCLUDED.total_amount;
  GET DIAGNOSTICS v_saved = ROW_COUNT;
  RETURN jsonb_build_object(
    'ok', true,
    'business_date', v_business_date,
    'saved_ticket_rows', v_saved,
    'rollover', v_rollover
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.archive_and_clear_daily_ticket_sales()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_business_date date := ((clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date - 1);
  v_ticket_count integer := 0;
  v_total_quantity bigint := 0;
  v_inserted integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pattaya-dinosaur-daily-ticket-rollover'));
  IF EXISTS (
    SELECT 1 FROM private.ticket_daily_rollovers r
    WHERE r.business_date = v_business_date
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'business_date', v_business_date);
  END IF;
  LOCK TABLE public.tickets IN SHARE ROW EXCLUSIVE MODE;
  INSERT INTO public.ticket_daily_sales
    (business_date, ticket_id, department, ticket_name, unit_price, quantity, total_amount)
  SELECT
    v_business_date, t.id, t.department, t.name, t.price, coalesce(t.quantity, 0),
    coalesce(t.quantity, 0) * coalesce(t.price, 0)
  FROM public.tickets t
  WHERE NOT coalesce(t.is_archived,false)
     OR (t.archived_at IS NOT NULL AND (t.archived_at AT TIME ZONE 'Asia/Bangkok')::date = v_business_date)
  ON CONFLICT (business_date, ticket_id) DO UPDATE
    SET department = EXCLUDED.department,
        ticket_name = EXCLUDED.ticket_name,
        unit_price = EXCLUDED.unit_price,
        quantity = EXCLUDED.quantity,
        total_amount = EXCLUDED.total_amount;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  SELECT count(*), coalesce(sum(coalesce(t.quantity, 0)), 0)
    INTO v_ticket_count, v_total_quantity
  FROM public.tickets t
  WHERE NOT coalesce(t.is_archived,false)
     OR (t.archived_at IS NOT NULL AND (t.archived_at AT TIME ZONE 'Asia/Bangkok')::date = v_business_date);
  UPDATE public.tickets
     SET quantity = 0,
         updated_at = now()
   WHERE quantity <> 0;
  INSERT INTO private.ticket_daily_rollovers (business_date, ticket_count, total_quantity)
  VALUES (v_business_date, v_ticket_count, v_total_quantity);
  RETURN jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'business_date', v_business_date,
    'archived_ticket_rows', v_inserted,
    'total_quantity', v_total_quantity,
    'cleared', true
  );
END;
$function$;
