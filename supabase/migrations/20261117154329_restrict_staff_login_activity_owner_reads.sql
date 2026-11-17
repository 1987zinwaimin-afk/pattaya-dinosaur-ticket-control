-- Restrict the staff login activity feed to the Owner.
-- Staff accounts may only read and maintain their own login-state row.
-- The existing Owner SELECT policy remains the only policy that can read all rows.

drop policy if exists "authenticated staff can upsert activity"
  on public.staff_login_activity;

create policy "staff can read own login state"
  on public.staff_login_activity
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "staff can insert own activity"
  on public.staff_login_activity
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'staff'
    )
  );

create policy "staff can update own activity"
  on public.staff_login_activity
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'staff'
    )
  );

create policy "owner can delete staff activity"
  on public.staff_login_activity
  for delete
  to authenticated
  using (public.ticket_control_is_owner());
