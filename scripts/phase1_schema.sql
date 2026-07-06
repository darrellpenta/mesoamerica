-- ============================================================
-- Phase I: Foundation schema — Mesoamerica knowledge graph
-- Run in Supabase SQL Editor (Database → SQL Editor)
-- Requires PostGIS to be enabled first (Database → Extensions)
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────────────────

create extension if not exists postgis;
create extension if not exists "uuid-ossp";


-- ── Sources ───────────────────────────────────────────────────────────────
-- Citation / provenance for every entity and relationship

create table public.sources (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  source_type text        not null default 'dataset',
  -- 'dataset' | 'publication' | 'institution' | 'web'
  url         text,
  description text,
  license     text,
  created_at  timestamptz default now()
);


-- ── Time periods ──────────────────────────────────────────────────────────
-- Named eras with parent–child hierarchy (Classic contains Early Classic, etc.)
-- Years: positive = CE, negative = BCE

create table public.time_periods (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  start_year       int  not null,
  end_year         int  not null,
  parent_period_id uuid references public.time_periods(id),
  description      text,
  source_id        uuid references public.sources(id)
);


-- ── Base entity registry ──────────────────────────────────────────────────
-- Every entity (place, person, event, etc.) has one row here.
-- Foreign keys in relationships and annotations always point to this table.

create table public.entities (
  id          uuid        primary key default gen_random_uuid(),
  entity_type text        not null,
  name        text        not null,
  source_id   uuid        references public.sources(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  constraint valid_entity_type check (entity_type in (
    'place', 'geo_feature', 'territory', 'admin_boundary',
    'person', 'polity', 'culture', 'event', 'time_period'
  ))
);

create index on public.entities(entity_type);
create index on public.entities(name);


-- ── Entity extension: places ──────────────────────────────────────────────
-- Named, human-occupied locations: archaeological sites, historic cities,
-- modern settlements, ceremonial centers.

create table public.places (
  entity_id      uuid                  primary key references public.entities(id) on delete cascade,
  geom           geometry(Point, 4326) not null,
  place_type     text                  not null,
  -- 'archaeological_site' | 'historic_city' | 'modern_settlement'
  -- | 'ceremonial_center' | 'fortification' | 'survey_area' | 'structure'
  date_start     int,          -- year first occupied / founded (negative = BCE)
  date_end       int,          -- year abandoned (null = still active or unknown)
  date_precision text          default 'approximate',
  -- 'exact' | 'approximate' | 'period_only' | 'unknown'
  date_label     text,         -- human-readable: "c. 300 BCE – 900 CE"
  elevation_m    int,
  alt_names      text[]        default '{}'
);

create index on public.places using gist(geom);
create index on public.places(place_type);
create index on public.places(date_start);


-- ── Entity extension: geo_features ───────────────────────────────────────
-- Natural geographic features: rivers, lakes, volcanoes, wetlands, reefs,
-- fault lines, hurricane tracks.

create table public.geo_features (
  entity_id    uuid    primary key references public.entities(id) on delete cascade,
  geom         geometry not null,  -- any geometry type
  feature_type text    not null,
  -- 'volcano' | 'river' | 'lake' | 'wetland' | 'coral_reef' | 'mangrove'
  -- | 'fault' | 'hurricane_track' | 'road' | 'earthquake'
  subtype      text,
  date_start   int,
  date_end     int
);

create index on public.geo_features using gist(geom);
create index on public.geo_features(feature_type);


-- ── Entity extension: territories ────────────────────────────────────────
-- Politically or culturally defined spatial extents, valid for a time range.
-- Includes: empire extents, culture areas, language regions, ecoregions,
-- protected areas, survey footprints.
-- For territories that change shape over time: multiple rows, different
-- date_start/date_end, different geometries.

create table public.territories (
  entity_id      uuid    primary key references public.entities(id) on delete cascade,
  geom           geometry not null,
  territory_type text    not null,
  -- 'political' | 'cultural' | 'ecological' | 'linguistic'
  -- | 'conservation' | 'survey'
  date_start     int,
  date_end       int,
  date_label     text
);

create index on public.territories using gist(geom);
create index on public.territories(territory_type);


-- ── Entity extension: admin_boundaries ──────────────────────────────────
-- Modern administrative units — countries, states/departments, municipalities.
-- Stable geographic anchors used for spatial joins.

create table public.admin_boundaries (
  entity_id   uuid    primary key references public.entities(id) on delete cascade,
  geom        geometry not null,
  admin_level int     not null default 0,  -- 0=country, 1=state/dept, 2=municipality
  iso_code    text
);

create index on public.admin_boundaries using gist(geom);
create index on public.admin_boundaries(admin_level);


-- ── Entity extension: persons ─────────────────────────────────────────────
-- Historical figures. Linked spatially via relationships (BORN_AT, DIED_AT,
-- RULED) — no geometry column here.

create table public.persons (
  entity_id      uuid  primary key references public.entities(id) on delete cascade,
  person_type    text,
  -- 'ruler' | 'military' | 'religious' | 'explorer' | 'scholar' | 'diplomat'
  birth_year     int,
  death_year     int,
  floruit_start  int,  -- "flourished" years when exact dates unknown
  floruit_end    int,
  date_precision text  default 'approximate',
  date_label     text, -- "r. 682–734 CE", "fl. 600s CE"
  alt_names      text[] default '{}'
);


-- ── Entity extension: polities ────────────────────────────────────────────
-- Governing entities: city-states, kingdoms, empires, colonial
-- administrations, modern nations. Linked to territory via CONTROLLED_BY.

create table public.polities (
  entity_id         uuid  primary key references public.entities(id) on delete cascade,
  polity_type       text  not null,
  -- 'city_state' | 'kingdom' | 'empire' | 'colonial' | 'nation' | 'confederation'
  founded_year      int,
  dissolved_year    int,
  date_label        text,
  capital_entity_id uuid  references public.entities(id)
);


-- ── Entity extension: cultures ────────────────────────────────────────────
-- Cultural or ethnic groups — broader and longer-lived than polities.

create table public.cultures (
  entity_id       uuid  primary key references public.entities(id) on delete cascade,
  culture_type    text,
  -- 'archaeological' | 'ethnic' | 'linguistic'
  active_from     int,
  active_to       int,
  language_family text
);


-- ── Entity extension: events ──────────────────────────────────────────────
-- Discrete occurrences. Two temporal tracks:
--   date_ts_*   — for modern events with known timestamps (e.g. ACLED data)
--   date_year_* — for historical events (year-level, negative = BCE)

create table public.events (
  entity_id       uuid                  primary key references public.entities(id) on delete cascade,
  geom            geometry(Point, 4326),  -- nullable for non-geographic events
  event_type      text                  not null,
  -- 'conflict' | 'natural_disaster' | 'political' | 'diplomatic'
  -- | 'cultural' | 'demographic' | 'founding' | 'collapse'
  event_subtype   text,
  date_ts_start   timestamptz,
  date_ts_end     timestamptz,
  date_year_start int,
  date_year_end   int,
  date_precision  text                  not null default 'approximate',
  date_label      text,
  fatalities      int,
  actor_name      text,    -- free-text actor for conflict events without person entities
  event_key       text     unique,  -- stable key from source data (conflict-events: hash key)
  notes           text
);

create index on public.events using gist(geom);
create index on public.events(event_type);
create index on public.events(date_year_start);
create index on public.events(date_ts_start);
create index on public.events(event_key);


-- ── Relationships ─────────────────────────────────────────────────────────
-- Typed, time-bounded edges between any two entities.
-- relation_type vocabulary: LOCATED_IN, CONTROLLED_BY, RULED, FOUNDED_BY,
-- SUCCEEDED_BY, AT_WAR_WITH, ALLIED_WITH, TRADED_WITH, PART_OF,
-- PART_OF_CULTURE, DURING, PRECEDED_BY, BORN_AT, DIED_AT,
-- PARTICIPATED_IN, RELATED_TO, DEFEATED, CONTEMPORARY_WITH, ALSO_KNOWN_AS

create table public.relationships (
  id             uuid        primary key default gen_random_uuid(),
  from_entity_id uuid        not null references public.entities(id),
  to_entity_id   uuid        not null references public.entities(id),
  relation_type  text        not null,
  valid_from     int,         -- year relationship became true (negative = BCE)
  valid_to       int,         -- year it ended (null = still true or unknown)
  date_label     text,
  source_id      uuid        references public.sources(id),
  notes          text,
  created_at     timestamptz default now(),
  constraint no_self_loop check (from_entity_id != to_entity_id)
);

create index on public.relationships(from_entity_id, relation_type);
create index on public.relationships(to_entity_id, relation_type);
create index on public.relationships(relation_type);


-- ── Layer definitions ─────────────────────────────────────────────────────
-- Map layer configuration — replaces src/layers/index.js as the source of truth.
-- entity_type tells the app which database table a layer draws from.

create table public.layer_definitions (
  id              text    primary key,  -- slug: 'sites', 'volcanoes', etc.
  label           text    not null,
  description     text,
  entity_type     text    not null,     -- 'place' | 'geo_feature' | 'territory' | 'event' | 'admin_boundary'
  filter_rules    jsonb   default '{}', -- e.g. {"place_type": "archaeological_site"}
  mapbox_type     text    not null,     -- 'circle' | 'fill' | 'line'
  color           text    not null,
  visible_default boolean default false,
  disabled        boolean default false,
  display_order   int     not null default 0,
  source_id       uuid    references public.sources(id)
);


-- ── Annotations ──────────────────────────────────────────────────────────
-- Admin-authored markdown notes on any entity.
-- Stored independently from source data — never modifies original records.

create table public.annotations (
  id         uuid        primary key default gen_random_uuid(),
  entity_id  uuid        not null references public.entities(id),
  content_md text        not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(entity_id)  -- one annotation record per entity; use markdown sections for multiple notes
);


-- ── Row Level Security ────────────────────────────────────────────────────
-- Public read for all tables; writes unrestricted (auth handled at app layer).

alter table public.sources           enable row level security;
alter table public.time_periods      enable row level security;
alter table public.entities          enable row level security;
alter table public.places            enable row level security;
alter table public.geo_features      enable row level security;
alter table public.territories       enable row level security;
alter table public.admin_boundaries  enable row level security;
alter table public.persons           enable row level security;
alter table public.polities          enable row level security;
alter table public.cultures          enable row level security;
alter table public.events            enable row level security;
alter table public.relationships     enable row level security;
alter table public.layer_definitions enable row level security;
alter table public.annotations       enable row level security;

create policy "public read" on public.sources           for select using (true);
create policy "public read" on public.time_periods      for select using (true);
create policy "public read" on public.entities          for select using (true);
create policy "public read" on public.places            for select using (true);
create policy "public read" on public.geo_features      for select using (true);
create policy "public read" on public.territories       for select using (true);
create policy "public read" on public.admin_boundaries  for select using (true);
create policy "public read" on public.persons           for select using (true);
create policy "public read" on public.polities          for select using (true);
create policy "public read" on public.cultures          for select using (true);
create policy "public read" on public.events            for select using (true);
create policy "public read" on public.relationships     for select using (true);
create policy "public read" on public.layer_definitions for select using (true);
create policy "public read" on public.annotations       for select using (true);

create policy "allow write" on public.sources           for all using (true) with check (true);
create policy "allow write" on public.time_periods      for all using (true) with check (true);
create policy "allow write" on public.entities          for all using (true) with check (true);
create policy "allow write" on public.places            for all using (true) with check (true);
create policy "allow write" on public.geo_features      for all using (true) with check (true);
create policy "allow write" on public.territories       for all using (true) with check (true);
create policy "allow write" on public.admin_boundaries  for all using (true) with check (true);
create policy "allow write" on public.persons           for all using (true) with check (true);
create policy "allow write" on public.polities          for all using (true) with check (true);
create policy "allow write" on public.cultures          for all using (true) with check (true);
create policy "allow write" on public.events            for all using (true) with check (true);
create policy "allow write" on public.relationships     for all using (true) with check (true);
create policy "allow write" on public.layer_definitions for all using (true) with check (true);
create policy "allow write" on public.annotations       for all using (true) with check (true);


-- ── Seed: time periods ────────────────────────────────────────────────────

insert into public.time_periods (name, start_year, end_year) values
  ('Preclassic',          -2000,   250),
  ('Classic',               250,   900),
  ('Postclassic',           900,  1519),
  ('Colonial',             1519,  1821),
  ('Modern',               1821,  2100),
  ('Early Preclassic',   -2000, -1000),
  ('Middle Preclassic',  -1000,  -400),
  ('Late Preclassic',     -400,   250),
  ('Early Classic',        250,   600),
  ('Late Classic',         600,   800),
  ('Terminal Classic',     800,   900),
  ('Early Postclassic',    900,  1200),
  ('Late Postclassic',    1200,  1519);

-- Link sub-periods to their parents
update public.time_periods
set parent_period_id = (select id from public.time_periods where name = 'Preclassic')
where name in ('Early Preclassic', 'Middle Preclassic', 'Late Preclassic');

update public.time_periods
set parent_period_id = (select id from public.time_periods where name = 'Classic')
where name in ('Early Classic', 'Late Classic', 'Terminal Classic');

update public.time_periods
set parent_period_id = (select id from public.time_periods where name = 'Postclassic')
where name in ('Early Postclassic', 'Late Postclassic');
