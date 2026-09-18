-- Brings a database created from an earlier db/schema.sql up to date for the
-- /admin workspace: product photos, admin history and undoable deletions.
-- Safe to run more than once. Fresh databases get all of this from schema.sql.
begin;

alter table menu_items add column if not exists image_key text;

create table if not exists admin_audit (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor        text not null default '',
  venue        venue not null references venues (slug) on delete cascade,
  action       text not null check (action in ('create', 'update', 'price', 'visibility', 'reorder', 'move', 'delete', 'restore', 'image')),
  record_type  text not null check (record_type in ('venue', 'group', 'category', 'product')),
  record_id    integer,
  record_name  text not null default '',
  summary      text not null,
  details      jsonb not null default '{}'
);
create index if not exists admin_audit_venue_created_idx on admin_audit (venue, created_at desc, id desc);

create table if not exists admin_deletions (
  id           integer generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor        text not null default '',
  venue        venue not null references venues (slug) on delete cascade,
  record_type  text not null check (record_type in ('group', 'category', 'product')),
  record_id    integer not null,
  record_name  text not null,
  snapshot     jsonb not null,
  image_keys   text[] not null default '{}',
  restored_at  timestamptz
);
create index if not exists admin_deletions_venue_created_idx on admin_deletions (venue, created_at);

commit;
