-- Per-user message hiding. This never deletes or changes the original chat message.
create table if not exists public.team_chat_hidden_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direct_message_id uuid references public.team_chat_messages(id) on delete cascade,
  group_message_id uuid references public.team_chat_group_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint team_chat_hidden_messages_exactly_one_target
    check (num_nonnulls(direct_message_id, group_message_id) = 1),
  constraint team_chat_hidden_messages_direct_unique unique (user_id, direct_message_id),
  constraint team_chat_hidden_messages_group_unique unique (user_id, group_message_id)
);
alter table public.team_chat_hidden_messages enable row level security;
drop policy if exists "users can read own hidden chat messages" on public.team_chat_hidden_messages;
create policy "users can read own hidden chat messages"
on public.team_chat_hidden_messages for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists "users can hide messages in their conversations" on public.team_chat_hidden_messages;
create policy "users can hide messages in their conversations"
on public.team_chat_hidden_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    (direct_message_id is not null and exists (
      select 1 from public.team_chat_messages m
      where m.id = direct_message_id
        and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    ))
    or
    (group_message_id is not null and exists (
      select 1 from public.team_chat_group_messages gm
      where gm.id = group_message_id
        and is_team_chat_group_member(gm.group_id, (select auth.uid()))
    ))
  )
);
grant select, insert on public.team_chat_hidden_messages to authenticated;
