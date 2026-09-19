-- Adds the venue's practical details and its links: where it is, when it is
-- open, how to call it, and where to follow it or leave a review. They appear
-- in the footer at the end of the menu. Safe to run more than once; fresh
-- databases get all of this from db/schema.sql.
begin;

alter table venues add column if not exists address        text not null default '';
alter table venues add column if not exists phone          text not null default '';
alter table venues add column if not exists hours          text not null default '';
alter table venues add column if not exists maps_url       text not null default '';
alter table venues add column if not exists review_url     text not null default '';
alter table venues add column if not exists instagram_url  text not null default '';
alter table venues add column if not exists facebook_url   text not null default '';

commit;
