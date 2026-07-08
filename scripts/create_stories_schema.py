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
CREATE TABLE IF NOT EXISTS stories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text,
  theme       text,
  time_start  integer,
  time_end    integer,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_entities (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      uuid        NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  entity_id     uuid        NOT NULL REFERENCES entities(id),
  entity_type   text        NOT NULL,
  role_in_story text,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_entities_story_id  ON story_entities(story_id);
CREATE INDEX IF NOT EXISTS idx_story_entities_entity_id ON story_entities(entity_id);

CREATE TABLE IF NOT EXISTS data_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id       uuid        REFERENCES stories(id) ON DELETE CASCADE,
  prompt         text        NOT NULL,
  url_hints      text[],
  status         text        NOT NULL DEFAULT 'pending',
  result_summary text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_requests_story_id ON data_requests(story_id);
"""

cur.execute(sql)
print('Created: stories, story_entities, data_requests')

cur.close()
conn.close()
