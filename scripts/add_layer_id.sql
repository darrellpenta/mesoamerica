-- Add layer_id to entities so the GeoJSON generator can query by layer.
-- Run in Supabase SQL Editor after phase1_schema.sql + phase1_seed.sql.

ALTER TABLE public.entities
  ADD COLUMN layer_id text REFERENCES public.layer_definitions(id);

CREATE INDEX ON public.entities(layer_id);
