-- Chichkhan menu schema for Neon Postgres (Postgres 15 or later).
-- Run once in the Neon SQL Editor, then run seed.sql.
begin;

-- The two venues. Every category and item belongs to exactly one of them,
-- and the site only ever reads rows for the venue named in the URL.
create type venue as enum ('restaurant', 'cafe');

create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Venue identity shown in the hero band. Image keys are object keys in the
-- Cloudflare R2 bucket, e.g. 'venues/cafe/hero.webp'. NULL shows the placeholder.
create table venues (
  slug            venue primary key,
  name            text not null check (name <> ''),
  title           text not null check (title <> ''),
  subtitle        text not null default '',
  eyebrow         text not null default '',
  description     text not null default '',
  hero_image_key  text,
  hero_image_alt  text not null default '',
  hero_focus_y    smallint not null default 50 check (hero_focus_y between 0 and 100),
  logo_image_key  text,
  updated_at      timestamptz not null default now()
);

-- Headings that group categories in the sidebar and category dialog.
create table category_groups (
  id        integer generated always as identity primary key,
  venue     venue not null references venues (slug) on delete cascade,
  name      text not null check (name <> ''),
  position  integer not null default 0,
  unique (venue, name),
  unique (venue, id)
);

create table categories (
  id          integer generated always as identity primary key,
  venue       venue not null references venues (slug) on delete cascade,
  group_id    integer,
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (name <> ''),
  note        text not null default '',
  image_key   text,
  source      text not null default '',
  position    integer not null default 0,
  is_visible  boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (venue, slug),
  unique (venue, id),
  -- A category can only sit in a group of its own venue.
  foreign key (venue, group_id) references category_groups (venue, id) on delete set null (group_id)
);

create table menu_items (
  id              integer generated always as identity primary key,
  venue           venue not null,
  category_id     integer not null,
  name            text not null check (name <> ''),
  description     text not null default '',
  price_millimes  integer not null check (price_millimes >= 0),
  is_house        boolean not null default false,
  position        integer not null default 0,
  is_visible      boolean not null default true,
  -- Optional product photo, an R2 object key like the category image.
  image_key       text,
  updated_at      timestamptz not null default now(),
  -- An item can only sit in a category of its own venue.
  foreign key (venue, category_id) references categories (venue, id) on delete cascade
);

create index categories_venue_position_idx on categories (venue, position, id);
create index menu_items_venue_position_idx on menu_items (venue, category_id, position, id);

-- Admin history: who changed what, per venue. Written by the /admin API only;
-- the public site never reads it.
create table admin_audit (
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
create index admin_audit_venue_created_idx on admin_audit (venue, created_at desc, id desc);

-- Deleted records, kept briefly so the administrator can undo a deletion.
-- image_keys lists the photos the snapshot still refers to, so they are not
-- removed from storage while an undo is possible.
create table admin_deletions (
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
create index admin_deletions_venue_created_idx on admin_deletions (venue, created_at);

create trigger venues_updated_at before update on venues
  for each row execute function set_updated_at();
create trigger categories_updated_at before update on categories
  for each row execute function set_updated_at();
create trigger menu_items_updated_at before update on menu_items
  for each row execute function set_updated_at();

commit;
