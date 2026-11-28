-- Tighten normal-day message writes to active Owner profiles only.
drop policy if exists "Owners manage calendar day messages" on public.calendar_day_messages;
create policy "Owners manage calendar day messages"
  on public.calendar_day_messages
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'owner'
        and coalesce(p.is_archived, false) = false
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'owner'
        and coalesce(p.is_archived, false) = false
    )
  );
