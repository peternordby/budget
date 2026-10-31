-- Where a merkelapp went: the trip's cities and countries, in itinerary order,
-- each with coordinates and an optional arrival date. /innsikt draws them as a
-- map and splits the trip's days between them.
--
-- One encrypted JSON array (lib/crypto.ts), like tag.name: where someone has
-- been is as private as what they spent there, and nothing in SQL needs to read
-- it — the map and the per-stop totals are computed in the browser.
--
-- Safe to run twice.

alter table public.tag add column if not exists places text;

-- Rollback:
--   alter table public.tag drop column if exists places;
