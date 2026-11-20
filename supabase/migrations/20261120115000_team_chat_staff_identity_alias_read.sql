-- Allow a Staff account to read direct messages addressed to another
-- active profile carrying the same canonical Staff ID. This repairs duplicate
-- auth/profile identities without merging, deleting, or rewriting chat history.
-- Owner access remains governed by the existing exact-UID policy.
create policy "staff identity aliases can read direct messages"
on public.team_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.id = (select auth.uid())
      and me.role = 'staff'
      and me.is_archived = false
      and nullif(btrim(me.staff_id), '') is not null
      and exists (
        select 1
        from public.profiles alias_profile
        where alias_profile.role = 'staff'
          and alias_profile.is_archived = false
          and upper(btrim(alias_profile.staff_id)) = upper(btrim(me.staff_id))
          and alias_profile.id in (
            public.team_chat_messages.sender_id,
            public.team_chat_messages.recipient_id
          )
      )
  )
);
