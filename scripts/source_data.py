#!/usr/bin/env python3
"""
Agentic data sourcing agent for the Mesoamerica project.

Polls data_requests with status='pending', uses an LLM to find and normalize
entities, then writes staged_imports rows for human review in the admin UI.

Requirements:
  pip install requests psycopg2-binary python-dotenv
  pip install anthropic   # optional, enables Claude + web search
  Ollama running locally  # free fallback, no API key needed

Usage:
  python3 scripts/source_data.py               # process one pending request
  python3 scripts/source_data.py --all         # process all pending requests
  python3 scripts/source_data.py --id <uuid>   # process a specific request
  python3 scripts/source_data.py --retry-failed # reset failed→pending, then process all
  python3 scripts/source_data.py --watch        # poll every 30s for new pending requests
  python3 scripts/source_data.py --watch --interval 60  # custom poll interval
  python3 scripts/source_data.py --dry-run     # preview without writing to DB

Fallback chain (tried in order):
  1. Claude claude-sonnet-5 + web_search tool  (requires ANTHROPIC_API_KEY)
  2. Claude + fetched URL content              (requires ANTHROPIC_API_KEY + url_hints)
  3. Claude model knowledge only              (requires ANTHROPIC_API_KEY)
  4. Ollama (local) + fetched URL content     (requires Ollama running at localhost:11434)
  5. Ollama model knowledge only             (requires Ollama running at localhost:11434)

Set ANTHROPIC_API_KEY in .env to enable Claude steps.
Ollama is always tried as a free fallback if it is running.
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
OLLAMA_BASE       = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')

# Preferred Ollama models in order of quality for this task
OLLAMA_PREFERRED = [
    'llama3.2', 'llama3.1', 'llama3', 'llama2',
    'mistral', 'mixtral', 'gemma2', 'gemma',
    'phi3', 'phi', 'qwen2',
]

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
    if theme:   parts.append(f'Theme: {theme}')
    if ts or te: parts.append(f'Time range: {ts or "?"} to {te or "?"}')
    if desc:    parts.append(f'Description: {desc}')
    return '\n'.join(parts)


# ── URL fetching ───────────────────────────────────────────────────────────────

def fetch_url_text(url, max_chars=10_000):
    try:
        r = http.get(url, timeout=20, headers={'User-Agent': 'Mozilla/5.0 (research bot)'})
        r.raise_for_status()
        text = r.text
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<style[^>]*>.*?</style>',  '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:max_chars]
    except Exception as e:
        return f'[Could not fetch {url}: {e}]'


# ── Ollama ─────────────────────────────────────────────────────────────────────

def detect_ollama_model():
    """Return the best available local Ollama model, or None if Ollama is not running."""
    try:
        r = http.get(f'{OLLAMA_BASE}/api/tags', timeout=5)
        r.raise_for_status()
        models = [m['name'].split(':')[0] for m in r.json().get('models', [])]
        if not models:
            return None
        for preferred in OLLAMA_PREFERRED:
            if preferred in models:
                return preferred
        return models[0]  # use whatever is installed
    except Exception:
        return None


def call_ollama(model, user_msg, system=SYSTEM_PROMPT):
    r = http.post(
        f'{OLLAMA_BASE}/api/chat',
        json={
            'model':    model,
            'stream':   False,
            'messages': [
                {'role': 'system',  'content': system},
                {'role': 'user',    'content': user_msg},
            ],
        },
        timeout=180,
    )
    r.raise_for_status()
    return r.json()['message']['content']


# ── Claude ─────────────────────────────────────────────────────────────────────

def make_anthropic_client():
    import anthropic
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def extract_text(response):
    return '\n'.join(b.text for b in response.content if hasattr(b, 'text') and b.text)


def call_claude_web_search(client, user_msg):
    response = client.messages.create(
        model='claude-sonnet-5',
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        tools=[{'type': 'web_search_20250305', 'name': 'web_search'}],
        messages=[{'role': 'user', 'content': user_msg}],
    )
    return extract_text(response)


def call_claude_with_content(client, user_msg):
    response = client.messages.create(
        model='claude-sonnet-5',
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': user_msg}],
    )
    return extract_text(response)


# ── Response parsing ──────────────────────────────────────────────────────────

def parse_response(raw):
    if not raw:
        raise ValueError('Empty response')

    raw = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r'\s*```$',          '', raw.strip(), flags=re.MULTILINE)

    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        raise ValueError('No JSON object found in response')

    data     = json.loads(match.group(0))
    summary  = str(data.get('summary', ''))[:1000]

    def _year(val):
        if val is None: return None
        try: return int(val)
        except (TypeError, ValueError): return None

    normalized = []
    for e in data.get('entities', []):
        name = str(e.get('name', '')).strip()[:500]
        if not name:
            continue
        etype = str(e.get('entity_type', '')).lower().replace(' ', '_')
        if etype not in ENTITY_TYPES:
            etype = 'place'
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

def source_request(cur, client, ollama_model, req, dry_run=False):
    req_id    = req['id']
    story_id  = req['story_id']
    prompt    = req['prompt']
    url_hints = req.get('url_hints') or []

    print(f'\n  Prompt: {prompt[:100]}')
    if url_hints:
        print(f'  URL hints: {url_hints}')

    story_ctx = fetch_story_context(cur, story_id)
    base_msg  = f'{story_ctx}\n\n---\n\nSourcing request: {prompt}' if story_ctx else f'Sourcing request: {prompt}'

    raw_text    = None
    method_used = None

    # ── 1. Claude + web search ──
    if client:
        try:
            print('  [1/5] Claude + web search…')
            raw_text    = call_claude_web_search(client, base_msg)
            method_used = 'claude_web_search'
        except Exception as e:
            print(f'       failed: {e}')

    # ── 2. Claude + fetched URL content ──
    if not raw_text and client and url_hints:
        try:
            print('  [2/5] Claude + fetched URL content…')
            chunks = '\n\n'.join(f'=== {u} ===\n{fetch_url_text(u)}' for u in url_hints[:3])
            raw_text    = call_claude_with_content(client, f'{base_msg}\n\nURL content:\n\n{chunks}')
            method_used = 'claude_url_content'
        except Exception as e:
            print(f'       failed: {e}')

    # ── 3. Claude knowledge only ──
    if not raw_text and client:
        try:
            print('  [3/5] Claude model knowledge only…')
            msg = (f'{base_msg}\n\nNo live web search available. '
                   'Use training knowledge and set confidence="model_knowledge".')
            raw_text    = call_claude_with_content(client, msg)
            method_used = 'claude_knowledge'
        except Exception as e:
            print(f'       failed: {e}')

    # ── 4. Ollama + fetched URL content ──
    if not raw_text and ollama_model and url_hints:
        try:
            print(f'  [4/5] Ollama ({ollama_model}) + fetched URL content…')
            chunks = '\n\n'.join(f'=== {u} ===\n{fetch_url_text(u)}' for u in url_hints[:3])
            raw_text    = call_ollama(ollama_model, f'{base_msg}\n\nURL content:\n\n{chunks}')
            method_used = 'ollama_url_content'
        except Exception as e:
            print(f'       failed: {e}')

    # ── 5. Ollama knowledge only ──
    if not raw_text and ollama_model:
        try:
            print(f'  [5/5] Ollama ({ollama_model}) model knowledge only…')
            msg = (f'{base_msg}\n\nNo live web search available. '
                   'Use training knowledge and set confidence="model_knowledge".')
            raw_text    = call_ollama(ollama_model, msg)
            method_used = 'ollama_knowledge'
        except Exception as e:
            print(f'       failed: {e}')

    # ── Hard failure ──
    if not raw_text:
        tips = []
        if not client:       tips.append('add ANTHROPIC_API_KEY to .env for Claude')
        if not ollama_model: tips.append('start Ollama (ollama serve) for a free local fallback')
        msg = 'All sourcing attempts failed. ' + (' | '.join(tips) if tips else '')
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
        msg = f'Could not parse LLM response: {e}\n\nRaw (first 500 chars):\n{raw_text[:500]}'
        if not dry_run:
            cur.execute(
                "UPDATE data_requests SET status='failed', result_summary=%s WHERE id=%s",
                (msg, req_id)
            )
        print(f'  PARSE ERROR: {e}')
        return 0

    if not entities:
        msg = 'LLM returned 0 valid entities. Try rephrasing or adding URL hints.'
        if not dry_run:
            cur.execute(
                "UPDATE data_requests SET status='failed', result_summary=%s WHERE id=%s",
                (msg, req_id)
            )
        print(f'  EMPTY: {msg}')
        return 0

    # Mark all rows as model_knowledge if no live source was used
    if method_used in ('claude_knowledge', 'ollama_knowledge', 'ollama_url_content'):
        for e in entities:
            if e['confidence'] not in ('high', 'medium', 'low'):
                e['confidence'] = 'model_knowledge'

    if dry_run:
        print(f'\n  DRY RUN — {len(entities)} entities (method: {method_used}):')
        for e in entities:
            yr = (f'{e["date_start"] or ""}–{e["date_end"] or ""}'
                  if (e['date_start'] or e['date_end']) else '')
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

def process_batch(cur, client, ollama_model, fetch_sql, fetch_params=(), dry_run=False):
    """Fetch and process a batch of requests. Returns total entities staged."""
    cur.execute(fetch_sql, fetch_params)
    cols    = ['id', 'story_id', 'prompt', 'url_hints']
    pending = [dict(zip(cols, r)) for r in cur.fetchall()]

    if not pending:
        return 0

    print(f'\nProcessing {len(pending)} request(s)…')
    total = 0
    for req in pending:
        if not dry_run:
            cur.execute("UPDATE data_requests SET status='processing' WHERE id=%s", (req['id'],))
        try:
            count = source_request(cur, client, ollama_model, req, dry_run=dry_run)
            total += count
        except Exception as e:
            print(f'  Unexpected error: {e}')
            if not dry_run:
                cur.execute(
                    "UPDATE data_requests SET status='failed', result_summary=%s WHERE id=%s",
                    (f'Unexpected error: {e}', req['id'])
                )
    return total


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument('--all',          action='store_true', help='Process all pending requests')
    ap.add_argument('--id',           metavar='UUID',      help='Process one specific request')
    ap.add_argument('--retry-failed', action='store_true', help='Reset failed→pending, then process all')
    ap.add_argument('--watch',        action='store_true', help='Poll for new pending requests on a loop')
    ap.add_argument('--interval',     type=int, default=30, metavar='SECS',
                    help='Poll interval in seconds for --watch (default: 30)')
    ap.add_argument('--dry-run',      action='store_true', help='Preview without writing to DB')
    args = ap.parse_args()

    # ── Set up clients ──
    client = None
    if ANTHROPIC_API_KEY:
        try:
            client = make_anthropic_client()
            print('Claude API: available')
        except ImportError:
            print('WARNING: anthropic package not installed (pip install anthropic) — Claude disabled')
    else:
        print('Claude API: not configured (ANTHROPIC_API_KEY not set)')

    ollama_model = detect_ollama_model()
    if ollama_model:
        print(f'Ollama: available ({ollama_model})')
    else:
        print('Ollama: not running (start with: ollama serve)')

    if not client and not ollama_model:
        print('\nERROR: No LLM available. Set ANTHROPIC_API_KEY or start Ollama.')
        sys.exit(1)

    conn = get_conn()
    cur  = conn.cursor()

    # ── --retry-failed: reset failed requests back to pending ──
    if args.retry_failed and not args.dry_run:
        cur.execute(
            "UPDATE data_requests SET status='pending', result_summary=NULL "
            "WHERE status='failed' RETURNING id"
        )
        reset_ids = cur.fetchall()
        print(f'Reset {len(reset_ids)} failed request(s) to pending.')

    # ── Build query for this run ──
    if args.id:
        fetch_sql    = ("SELECT id, story_id, prompt, url_hints FROM data_requests "
                        "WHERE id=%s AND status='pending'")
        fetch_params = (args.id,)
    elif args.all or args.retry_failed:
        fetch_sql    = ("SELECT id, story_id, prompt, url_hints FROM data_requests "
                        "WHERE status='pending' ORDER BY created_at")
        fetch_params = ()
    else:
        fetch_sql    = ("SELECT id, story_id, prompt, url_hints FROM data_requests "
                        "WHERE status='pending' ORDER BY created_at LIMIT 1")
        fetch_params = ()

    if args.watch:
        import time
        print(f'\nWatch mode — polling every {args.interval}s. Press Ctrl+C to stop.\n')
        grand_total = 0
        try:
            while True:
                count = process_batch(cur, client, ollama_model, fetch_sql, fetch_params, args.dry_run)
                grand_total += count
                if count == 0:
                    print(f'  No pending requests — sleeping {args.interval}s…')
                else:
                    print(f'  Staged {count} entities this pass. Total so far: {grand_total}')
                time.sleep(args.interval)
        except KeyboardInterrupt:
            print(f'\nWatch mode stopped. Grand total: {grand_total} entities staged.')
    else:
        total = process_batch(cur, client, ollama_model, fetch_sql, fetch_params, args.dry_run)
        if total == 0 and not (args.id or args.retry_failed):
            print('No pending data requests.')
        else:
            print(f'\nTotal: {total} entities staged.')

    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
