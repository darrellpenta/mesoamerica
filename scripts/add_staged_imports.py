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
CREATE TABLE IF NOT EXISTS staged_imports (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid        NOT NULL REFERENCES data_requests(id) ON DELETE CASCADE,
  story_id       uuid        REFERENCES stories(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  entity_type    text        NOT NULL,
  date_start     integer,
  date_end       integer,
  description    text,
  source_url     text,
  source_label   text,
  confidence     text        NOT NULL DEFAULT 'medium',
  raw_data       jsonb,
  review_status  text        NOT NULL DEFAULT 'pending',
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staged_imports_request_id ON staged_imports(request_id);
CREATE INDEX IF NOT EXISTS idx_staged_imports_story_id   ON staged_imports(story_id);
CREATE INDEX IF NOT EXISTS idx_staged_imports_review     ON staged_imports(review_status);
"""

cur.execute(sql)
print('Created: staged_imports')

cur.close()
conn.close()
