#!/usr/bin/env python3
"""
Agentic data sourcing agent for the Mesoamerica project.

Polls data_requests with status='pending', uses Claude + web search to find
and normalize entities, then writes staged_imports rows for human review in
the admin UI.

Requirements:
  pip install anthropic requests psycopg2-binary python-dotenv

Usage:
  python3 scripts/source_data.py              # process one pending request
  python3 scripts/source_data.py --all        # process all pending requests
  python3 scripts/source_data.py --id <uuid>  # process a specific request
  python3 scripts/source_data.py --dry-run    # show what would be staged, no DB writes

Fallback chain (in order):
  1. Claude claude-sonnet-5 + web_search tool (requires ANTHROPIC_API_KEY)
  2. Claude + manually fetched URL content (if url_hints provided)
  3. Claude model knowledge only (confidence flagged as 'model_knowledge')
"""

import os
import sys
import re
import json
import argparse
import textwrap
import psycopg2
import requests as http
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

SUPABASE_DB_URL   = os.environ.get('SUPABASE_DB_URL')
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')

if not SUPABASE_DB_URL:
    raise SystemExit('SUPABASE_DB_URL not set in .env')

ENTITY_TYPES = ['person', 'place', 'geo_feature', 'territory', 'admin_boundary', 'event']

SYSTEM_PROMPT = textwrap.dedent("""
    You are a research assistant building a historical Mesoamerica database.

    Given a sourcing request, find factual data and return it as structured JSON.

    Rules:
    - Each entity must have a name and entity_type
    - entity_type must be one of: person, place, geo_feature, territory, admin_boundary, event
    - date_start / date_end are integer years (negative = BCE, e.g. -500 for 500 BCE)
    - Prefer primary and secondary sources; cite source_url when available
    - For confidence: 'high' = verified primary source, 'medium' = secondary/synthesis,
      'low' = uncertain, 'model_knowledge' = training data only (no live source)
    - Aim for 5-20 entities unless the scope naturally calls for more or fewer
    - Omit fields you cannot determine rather than guessing

    Return ONLY valid JSON — no prose before or after — in this exact shape:
    {
      "entities": [
        {
          "name": "...",
          "entity_type": "place",
          "date_start": null,
          "date_end": null,
          "description": "...",
          "source_url": null,
          "source_label": "...",
          "confidence": "medium"
        }
      ],
      "summary": "One or two sentences on what was found and how."
    }
""").strip()


# ── DB ─────────────────────────────────────────────────────────────────────────

def get_conn():
    conn = psycopg2.connect(SUPABASE_DB_URL)
    conn.autocommit = True
    return conn


def fetch_story_context(cur, story_id):
    if not story_id:
        return ''
    cur.execute(
        "SELECT title, description, theme, time_start, time_end FROM stories WHERE id = %s",
        (story_id,)
    )
    row = cur.fetchone()
    if not row:
        return ''
    title, desc, theme, ts, te = row
    parts = [f'Story: "{title}"']
    if theme:
        parts.append(f'Theme: {theme}')
    if ts or te:
        parts.append(f'Time range: {ts or "?"} to {te or "?"}')
    if desc:
        parts.append(f'Description: {desc}')
    return '\n'.join(parts)


# ── URL fetching fallback ──────────────────────────────────────────────────────

def fetch_url_text(url, max_chars=10_000):
    try:
        r = http.get(url, timeout=20, headers={'User-Agent': 'Mozilla/5.0 (research bot)'})
        r.raise_for_status()
        text = r.text
        # Strip scripts and styles first
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<style[^>]*>.*?</style>',  '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:max_chars]
    except Exception as e:
        return f'[Could not fetch {url}: {e}]'


# ── Claude calls ──────────────────────────────────────────────────────────────

def make_client():
    import anthropic
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def extract_text(response):
    parts = []
    for block in response.content:
        if hasattr(block, 'text') and block.text:
            parts.append(block.text)
    return '\n'.join(parts)


def call_with_web_search(client, user_msg):
    response = client.messages.create(
        model='claude-sonnet-5',
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        tools=[{'type': 'web_search_20250305', 'name': 'web_search'}],
        messages=[{'role': 'user', 'content': user_msg}],
    )
    return extract_text(response)


def call_with_url_content(client, user_msg, urls):
    chunks = '\n\n'.join(
        f'=== {url} ===\n{fetch_url_text(url)}'
        for url in urls[:3]
    )
    augmented = f'{user_msg}\n\nContent fetched from provided URLs:\n\n{chunks}'
    response = client.messages.create(
        model='claude-sonnet-5',
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': augmented}],
    )
    return extract_text(response)


def call_knowledge_only(client, user_msg):
    msg = (
        f'{user_msg}\n\n'
        'Note: no live web search is available for this request. '
        'Use your training knowledge and set confidence="model_knowledge" for all entities.'
    )
    response = client.messages.create(
        model='claude-sonnet-5',
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': msg}],
    )
    return extract_text(response)


# ── Response parsing ──────────────────────────────────────────────────────────

def parse_response(raw):
    """
    Extract JSON from Claude's response. Handles prose wrapping and markdown
    code fences. Returns (entities_list, summary_str).
    """
    if not raw:
        raise ValueError('Empty response from Claude')

    # Strip markdown code fences if present
    raw = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r'\s*```$', '', raw.strip(), flags=re.MULTILINE)

    # Find outermost JSON object
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        raise ValueError('No JSON object found in response')

    data = json.loads(match.group(0))
    entities_raw = data.get('entities', [])
    summary = str(data.get('summary', ''))[:1000]

    normalized = []
    for e in entities_raw:
        name = str(e.get('name', '')).strip()[:500]
        if not name:
            continue

        etype = str(e.get('entity_type', '')).lower().replace(' ', '_')
        if etype not in ENTITY_TYPES:
            etype = 'place'

        def _year(val):
            if val is None:
                return None
            try:
                return int(val)
            except (TypeError, ValueError):
                return None

        normalized.append({
            'name':         name,
            'entity_type':  etype,
            'date_start':   _year(e.get('date_start')),
            'date_end':     _year(e.get('date_end')),
            'description':  str(e.get('description') or '')[:2000],
            'source_url':   str(e.get('source_url') or '')[:1000] or None,
            'source_label': str(e.get('source_label') or '')[:500],
            'confidence':   str(e.get('confidence', 'medium'))[:50],
            'raw_data':     json.dumps(e),
        })

    return normalized, summary


# ── Core processing ───────────────────────────────────────────────────────────

def source_request(cur, client, req, dry_run=False):
    req_id    = req['id']
    story_id  = req['story_id']
    prompt    = req['prompt']
    url_hints = req.get('url_hints') or []

    print(f'\n  Prompt: {prompt[:100]}')
    if url_hints:
        print(f'  URL hints: {url_hints}')

    story_ctx = fetch_story_context(cur, story_id)
    user_msg  = f'{story_ctx}\n\n---\n\nSourcing request: {prompt}' if story_ctx else f'Sourcing request: {prompt}'

    raw_text    = None
    method_used = None

    # ── Fallback 1: web search ──
    if client:
        try:
            print('  [1/3] Trying Claude + web search…')
            raw_text    = call_with_web_search(client, user_msg)
            method_used = 'web_search'
        except Exception as e:
            print(f'  Web search failed: {e}')

    # ── Fallback 2: url_hints ──
    if not raw_text and url_hints and client:
        try:
            print('  [2/3] Fetching URL hints and passing to Claude…')
            raw_text    = call_with_url_content(client, user_msg, url_hints)
            method_used = 'url_hints'
        except Exception as e:
            print(f'  URL hint fallback failed: {e}')

    # ── Fallback 3: model knowledge ──
    if not raw_text and client:
        try:
            print('  [3/3] Falling back to model knowledge only…')
            raw_text    = call_knowledge_only(client, user_msg)
            method_used = 'model_knowledge'
        except Exception as e:
            print(f'  Model knowledge fallback failed: {e}')

    # ── Hard failure ──
    if not raw_text:
        msg = 'All sourcing attempts failed. Check ANTHROPIC_API_KEY and network.'
        if not dry_run:
            cur.execute(
                "UPDATE data_requests SET status='failed', result_summary=%s WHERE id=%s",
                (msg, req_id)
            )
        print(f'  FAILED: {msg}')
        return 0

    # ── Parse ──
    try:
        entities, summary = parse_response(raw_text)
    except Exception as e:
        msg = f'Could not parse Claude response: {e}\n\nRaw (first 500 chars):\n{raw_text[:500]}'
        if not dry_run:
            cur.execute(
                "UPDATE data_requests SET status='failed', result_summary=%s WHERE id=%s",
                (msg, req_id)
            )
        print(f'  PARSE ERROR: {e}')
        return 0

    if not entities:
        msg = 'Claude returned 0 valid entities. Try rephrasing the request or adding URL hints.'
        if not dry_run:
            cur.execute(
                "UPDATE data_requests SET status='failed', result_summary=%s WHERE id=%s",
                (msg, req_id)
            )
        print(f'  EMPTY: {msg}')
        return 0

    # If model knowledge was the method, override confidence on all rows
    if method_used == 'model_knowledge':
        for e in entities:
            e['confidence'] = 'model_knowledge'

    if dry_run:
        print(f'\n  DRY RUN — would stage {len(entities)} entities (method: {method_used}):')
        for e in entities:
            yr = f'{e["date_start"] or ""}–{e["date_end"] or ""}' if (e['date_start'] or e['date_end']) else ''
            print(f'    [{e["confidence"][:4]}] {e["name"]} ({e["entity_type"]}) {yr}')
            if e['description']:
                print(f'          {e["description"][:80]}')
        return len(entities)

    # ── Write staged_imports ──
    for e in entities:
        cur.execute("""
            INSERT INTO staged_imports
              (request_id, story_id, name, entity_type, date_start, date_end,
               description, source_url, source_label, confidence, raw_data)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
        """, (
            req_id, story_id,
            e['name'], e['entity_type'],
            e['date_start'], e['date_end'],
            e['description'], e['source_url'], e['source_label'],
            e['confidence'], e['raw_data'],
        ))

    result_summary = f'Found {len(entities)} entities via {method_used}. {summary}'
    cur.execute(
        "UPDATE data_requests SET status='review', result_summary=%s WHERE id=%s",
        (result_summary, req_id)
    )
    print(f'  Done: {len(entities)} entities staged for review (method: {method_used})')
    return len(entities)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--all',     action='store_true', help='Process all pending requests')
    ap.add_argument('--id',      metavar='UUID',      help='Process one specific request')
    ap.add_argument('--dry-run', action='store_true', help='Preview output without writing to DB')
    args = ap.parse_args()

    if not ANTHROPIC_API_KEY:
        print('WARNING: ANTHROPIC_API_KEY not set — Claude calls will fail and requests will be marked failed.')
        client = None
    else:
        try:
            client = make_client()
        except ImportError:
            print('ERROR: anthropic package not installed. Run: pip install anthropic')
            sys.exit(1)

    conn = get_conn()
    cur  = conn.cursor()

    if args.id:
        cur.execute(
            "SELECT id, story_id, prompt, url_hints FROM data_requests WHERE id=%s AND status='pending'",
            (args.id,)
        )
    elif args.all:
        cur.execute(
            "SELECT id, story_id, prompt, url_hints FROM data_requests WHERE status='pending' ORDER BY created_at"
        )
    else:
        cur.execute(
            "SELECT id, story_id, prompt, url_hints FROM data_requests WHERE status='pending' ORDER BY created_at LIMIT 1"
        )

    cols = ['id', 'story_id', 'prompt', 'url_hints']
    pending = [dict(zip(cols, r)) for r in cur.fetchall()]

    if not pending:
        print('No pending data requests.')
        cur.close(); conn.close()
        return

    print(f'Processing {len(pending)} request(s)…')
    total = 0

    for req in pending:
        if not args.dry_run:
            cur.execute("UPDATE data_requests SET status='processing' WHERE id=%s", (req['id'],))
        try:
            count = source_request(cur, client, req, dry_run=args.dry_run)
            total += count
        except Exception as e:
            print(f'  Unexpected error: {e}')
            if not args.dry_run:
                cur.execute(
                    "UPDATE data_requests SET status='failed', result_summary=%s WHERE id=%s",
                    (f'Unexpected error: {e}', req['id'])
                )

    print(f'\nTotal: {total} entities staged across {len(pending)} request(s).')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
