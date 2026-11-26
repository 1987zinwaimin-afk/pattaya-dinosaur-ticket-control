-- Add Owner-managed messages for ordinary dates in the Date & Time card.
-- This is additive: existing festival_media, authentication and business data are untouched.
create table if not exists public.calendar_day_messages (
  id uuid primary key default gen_random_uuid(),
  message_date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  message text not null check (char_length(btrim(message)) between 1 and 600),
  display_from time without time zone not null default '00:00:00',
  display_until time without time zone not null default '23:59:59',
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint calendar_day_messages_valid_window check (display_from < display_until)
);

create index if not exists calendar_day_messages_date_window_idx
  on public.calendar_day_messages (message_date, display_from, display_until)
  where is_active = true;

alter table public.calendar_day_messages enable row level security;

grant select, insert, update, delete on table public.calendar_day_messages to authenticated;

drop policy if exists "Active team can read calendar day messages" on public.calendar_day_messages;
create policy "Active team can read calendar day messages"
  on public.calendar_day_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = any (array['owner'::text, 'staff'::text])
        and coalesce(p.is_archived, false) = false
    )
  );

drop policy if exists "Owners manage calendar day messages" on public.calendar_day_messages;
create policy "Owners manage calendar day messages"
  on public.calendar_day_messages
  for all
  to authenticated
  using (public.ticket_control_is_owner())
  with check (public.ticket_control_is_owner());

comment on table public.calendar_day_messages is
  'Owner-managed date/time announcements shown in the Date & Time card on ordinary (non-festival) dates.';
