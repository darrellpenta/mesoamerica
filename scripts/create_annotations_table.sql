-- Run this in the Supabase SQL Editor for the mesoamerica project
-- https://supabase.com/dashboard/project/vqovdkjdawqdpzxomsiw/editor

create table if not exists annotations (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references entities(id) on delete cascade,
  key        text not null,
  value      text not null,
  data_type  text not null default 'text'
             check (data_type in ('text', 'number', 'date', 'url', 'markdown')),
  created_at timestamptz default now()
);

alter table annotations enable row level security;

create policy "public_all" on annotations
  for all using (true) with check (true);

-- Index for fast entity lookups
create index if not exists annotations_entity_id_idx on annotations(entity_id);
