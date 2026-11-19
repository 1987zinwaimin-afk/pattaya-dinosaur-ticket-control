alter table public.tickets
  add column if not exists is_archived boolean not null default false;

alter table public.tickets
  add column if not exists archived_at timestamptz;

alter table public.tickets
  add column if not exists archived_by uuid;

comment on column public.tickets.is_archived is
  'Soft archive flag for retired ticket templates; archived tickets and their images and sales history are preserved.';
comment on column public.tickets.archived_at is
  'Timestamp when the ticket template was archived.';
comment on column public.tickets.archived_by is
  'Authenticated user who archived or restored the ticket most recently.';
