import os
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')
db_url = os.environ.get('SUPABASE_DB_URL')
if not db_url:
    raise SystemExit('SUPABASE_DB_URL not found in .env')

conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

sql = """
-- ── export_entity_type ────────────────────────────────────────────────────────
-- Returns all fields for one entity type as JSONB rows.
-- Geometry is extracted to lon/lat (ST_Centroid for polygons).
-- Optional p_story_id filters to entities linked to that story.
CREATE OR REPLACE FUNCTION export_entity_type(
  p_type     text,
  p_story_id uuid    DEFAULT NULL,
  p_limit    integer DEFAULT 5000
)
RETURNS TABLE(row_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  _story_clause text := '';
  _sql          text;
BEGIN
  IF p_story_id IS NOT NULL THEN
    _story_clause := format(
      ' AND e.id IN (SELECT entity_id FROM story_entities WHERE story_id = %L)',
      p_story_id
    );
  END IF;

  IF p_type = 'person' THEN
    _sql := format($q$
      SELECT to_jsonb(t) FROM (
        SELECT e.id AS entity_id, e.name, e.entity_type,
               p.person_type, p.birth_year, p.death_year,
               p.floruit_start, p.floruit_end, p.date_label, p.date_precision
        FROM entities e
        LEFT JOIN persons p ON p.entity_id = e.id
        WHERE e.entity_type = 'person' %s
        ORDER BY e.name LIMIT %s
      ) t
    $q$, _story_clause, p_limit);

  ELSIF p_type = 'event' THEN
    _sql := format($q$
      SELECT to_jsonb(t) FROM (
        SELECT e.id AS entity_id, e.name, e.entity_type,
               ev.event_type, ev.event_subtype,
               ev.date_year_start, ev.date_year_end, ev.date_label,
               ev.fatalities, ev.actor_name, ev.notes,
               CASE WHEN ev.geom IS NOT NULL THEN ST_X(ev.geom::geometry) END AS lon,
               CASE WHEN ev.geom IS NOT NULL THEN ST_Y(ev.geom::geometry) END AS lat
        FROM entities e
        LEFT JOIN events ev ON ev.entity_id = e.id
        WHERE e.entity_type = 'event' %s
        ORDER BY ev.date_year_start NULLS LAST, e.name LIMIT %s
      ) t
    $q$, _story_clause, p_limit);

  ELSIF p_type = 'place' THEN
    _sql := format($q$
      SELECT to_jsonb(t) FROM (
        SELECT e.id AS entity_id, e.name, e.entity_type,
               pl.place_type, pl.date_start, pl.date_end, pl.date_label, pl.elevation_m,
               CASE WHEN pl.geom IS NOT NULL THEN ST_X(pl.geom::geometry) END AS lon,
               CASE WHEN pl.geom IS NOT NULL THEN ST_Y(pl.geom::geometry) END AS lat
        FROM entities e
        LEFT JOIN places pl ON pl.entity_id = e.id
        WHERE e.entity_type = 'place' %s
        ORDER BY e.name LIMIT %s
      ) t
    $q$, _story_clause, p_limit);

  ELSIF p_type = 'geo_feature' THEN
    _sql := format($q$
      SELECT to_jsonb(t) FROM (
        SELECT e.id AS entity_id, e.name, e.entity_type,
               gf.feature_type, gf.subtype, gf.date_start, gf.date_end,
               CASE WHEN gf.geom IS NOT NULL THEN ST_X(ST_Centroid(gf.geom::geometry)) END AS lon,
               CASE WHEN gf.geom IS NOT NULL THEN ST_Y(ST_Centroid(gf.geom::geometry)) END AS lat
        FROM entities e
        LEFT JOIN geo_features gf ON gf.entity_id = e.id
        WHERE e.entity_type = 'geo_feature' %s
        ORDER BY e.name LIMIT %s
      ) t
    $q$, _story_clause, p_limit);

  ELSIF p_type = 'territory' THEN
    _sql := format($q$
      SELECT to_jsonb(t) FROM (
        SELECT e.id AS entity_id, e.name, e.entity_type,
               t.territory_type, t.date_start, t.date_end, t.date_label,
               CASE WHEN t.geom IS NOT NULL THEN ST_X(ST_Centroid(t.geom::geometry)) END AS lon,
               CASE WHEN t.geom IS NOT NULL THEN ST_Y(ST_Centroid(t.geom::geometry)) END AS lat
        FROM entities e
        LEFT JOIN territories t ON t.entity_id = e.id
        WHERE e.entity_type = 'territory' %s
        ORDER BY e.name LIMIT %s
      ) t
    $q$, _story_clause, p_limit);

  ELSIF p_type = 'admin_boundary' THEN
    _sql := format($q$
      SELECT to_jsonb(t) FROM (
        SELECT e.id AS entity_id, e.name, e.entity_type,
               ab.admin_level, ab.iso_code,
               CASE WHEN ab.geom IS NOT NULL THEN ST_X(ST_Centroid(ab.geom::geometry)) END AS lon,
               CASE WHEN ab.geom IS NOT NULL THEN ST_Y(ST_Centroid(ab.geom::geometry)) END AS lat
        FROM entities e
        LEFT JOIN admin_boundaries ab ON ab.entity_id = e.id
        WHERE e.entity_type = 'admin_boundary' %s
        ORDER BY e.name LIMIT %s
      ) t
    $q$, _story_clause, p_limit);

  ELSE
    RAISE EXCEPTION 'Unknown entity type: %', p_type;
  END IF;

  RETURN QUERY EXECUTE _sql;
END;
$func$;


-- ── entity_type_counts ────────────────────────────────────────────────────────
-- Total row count per entity type, descending.
CREATE OR REPLACE FUNCTION entity_type_counts()
RETURNS TABLE(entity_type text, entity_count bigint)
LANGUAGE sql
SECURITY DEFINER AS $func$
  SELECT entity_type, COUNT(*) AS entity_count
  FROM entities
  GROUP BY entity_type
  ORDER BY entity_count DESC;
$func$;


-- ── entity_field_counts ───────────────────────────────────────────────────────
-- Grouped count for a categorical field within one entity type.
-- p_field is validated against an allowlist to prevent SQL injection.
CREATE OR REPLACE FUNCTION entity_field_counts(
  p_type  text,
  p_field text
)
RETURNS TABLE(field_value text, entity_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER AS $func$
DECLARE
  _table   text;
  _sql     text;
  _allowed text[] := ARRAY[
    'person_type', 'date_precision',
    'event_type', 'event_subtype', 'actor_name',
    'place_type', 'feature_type', 'subtype',
    'territory_type', 'admin_level', 'iso_code'
  ];
BEGIN
  IF NOT (p_field = ANY(_allowed)) THEN
    RAISE EXCEPTION 'Field "%" is not permitted for grouping', p_field;
  END IF;

  _table := CASE p_type
    WHEN 'person'         THEN 'persons'
    WHEN 'event'          THEN 'events'
    WHEN 'place'          THEN 'places'
    WHEN 'geo_feature'    THEN 'geo_features'
    WHEN 'territory'      THEN 'territories'
    WHEN 'admin_boundary' THEN 'admin_boundaries'
    ELSE NULL
  END;

  IF _table IS NULL THEN
    RAISE EXCEPTION 'Unknown entity type: %', p_type;
  END IF;

  _sql := format(
    $q$
      SELECT COALESCE(%I::text, '(blank)') AS field_value,
             COUNT(*)                       AS entity_count
      FROM entities e
      LEFT JOIN %I x ON x.entity_id = e.id
      WHERE e.entity_type = %L
      GROUP BY 1
      ORDER BY entity_count DESC
      LIMIT 200
    $q$,
    p_field, _table, p_type
  );

  RETURN QUERY EXECUTE _sql;
END;
$func$;


GRANT EXECUTE ON FUNCTION export_entity_type  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION entity_type_counts  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION entity_field_counts TO anon, authenticated;


-- ── export_relationships ──────────────────────────────────────────────────────
-- Returns all entity_relationships with denormalized from/to entity fields.
CREATE OR REPLACE FUNCTION export_relationships(
  p_story_id uuid    DEFAULT NULL,
  p_limit    integer DEFAULT 5000
)
RETURNS TABLE(row_data jsonb)
LANGUAGE sql
SECURITY DEFINER AS $func$
  SELECT to_jsonb(t) FROM (
    SELECT
      r.id              AS relation_id,
      r.from_entity_id,
      fe.name           AS from_entity_name,
      fe.entity_type    AS from_entity_type,
      r.relation_type,
      r.to_entity_id,
      te.name           AS to_entity_name,
      te.entity_type    AS to_entity_type,
      r.valid_from,
      r.valid_to,
      r.notes
    FROM relationships r
    JOIN entities fe ON fe.id = r.from_entity_id
    JOIN entities te ON te.id = r.to_entity_id
    WHERE (
      p_story_id IS NULL
      OR r.from_entity_id IN (SELECT entity_id FROM story_entities WHERE story_id = p_story_id)
      OR r.to_entity_id   IN (SELECT entity_id FROM story_entities WHERE story_id = p_story_id)
    )
    ORDER BY r.relation_type, fe.name
    LIMIT p_limit
  ) t;
$func$;

GRANT EXECUTE ON FUNCTION export_relationships TO anon, authenticated;
"""

cur.execute(sql)
print('Created RPCs: export_entity_type, entity_type_counts, entity_field_counts, export_relationships')
cur.close()
conn.close()
