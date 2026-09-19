-- Keeps the whole photo beside the crop the menu shows.
--
-- Until now only the cropped photo was stored, so re-cropping cut a crop:
-- each pass framed the previous result and the original was gone. Every photo
-- slot now carries a second key, the untouched photo it was cut from, and the
-- console always reframes from that one.
--
-- Photos uploaded before this migration have no original. They keep working:
-- the console falls back to the cropped file, and the next time that photo is
-- replaced both keys are written.
--
-- Idempotent: safe to run on a database that already has these columns.

alter table venues     add column if not exists hero_original_key text;
alter table venues     add column if not exists logo_original_key text;
alter table categories add column if not exists original_key      text;
alter table menu_items add column if not exists original_key      text;
