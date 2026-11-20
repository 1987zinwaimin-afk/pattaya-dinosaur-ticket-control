-- Safe, additive schema changes for Owner/Staff Team Chat message editing and unsending.
-- Existing messages, images, accounts, ticket data and payroll data are preserved.

alter table public.team_chat_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.team_chat_group_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

drop policy if exists "chat senders can edit or unsend own messages" on public.team_chat_messages;
create policy "chat senders can edit or unsend own messages"
on public.team_chat_messages
for update to authenticated
using (
  sender_id = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.role in ('owner','staff') and me.is_archived = false
  )
)
with check (
  sender_id = (select auth.uid())
  and recipient_id <> (select auth.uid())
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.role in ('owner','staff') and me.is_archived = false
  )
);

drop policy if exists "group chat senders can edit or unsend own messages" on public.team_chat_group_messages;
create policy "group chat senders can edit or unsend own messages"
on public.team_chat_group_messages
for update to authenticated
using (
  sender_id = (select auth.uid())
  and deleted_at is null
  and is_team_chat_group_member(group_id, (select auth.uid()))
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.role in ('owner','staff') and me.is_archived = false
  )
)
with check (
  sender_id = (select auth.uid())
  and is_team_chat_group_member(group_id, (select auth.uid()))
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.role in ('owner','staff') and me.is_archived = false
  )
);

grant update (read_at, body, edited_at, deleted_at)
  on public.team_chat_messages to authenticated;
grant update (body, edited_at, deleted_at)
  on public.team_chat_group_messages to authenticated;
