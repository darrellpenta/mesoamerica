#!/usr/bin/env python3
"""
Seed script: 'The Long Shadow — US Intervention in Central America, 1823–Present'
Creates ~20 persons, ~16 events, 5 places, country territory references,
~50 relationships, and ~70 annotations from the research document.

Usage:
  python3 scripts/seed_long_shadow.py            # commit to DB
  python3 scripts/seed_long_shadow.py --dry-run  # preview only, rollback
"""

import os, sys, uuid
import psycopg2, psycopg2.extras
from dotenv import load_dotenv

load_dotenv()
DRY_RUN = '--dry-run' in sys.argv

DB_URL = os.environ.get('SUPABASE_DB_URL')
if not DB_URL:
    sys.exit('ERROR: SUPABASE_DB_URL not set in .env')

conn = psycopg2.connect(DB_URL)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

SOURCE_TITLE = 'The Long Shadow: United States Intervention in Central America, 1823–Present'


# ── Column introspection ────────────────────────────────────────────────────

def get_cols(table):
    cur.execute("""SELECT column_name FROM information_schema.columns
                   WHERE table_name=%s AND table_schema='public'""", (table,))
    return {r['column_name'] for r in cur.fetchall()}


# ── Helpers ─────────────────────────────────────────────────────────────────

def find(name, etype=None):
    if etype:
        cur.execute('SELECT id FROM entities WHERE name=%s AND entity_type=%s LIMIT 1', (name, etype))
    else:
        cur.execute('SELECT id FROM entities WHERE name=%s LIMIT 1', (name,))
    r = cur.fetchone()
    return r['id'] if r else None

def find_ilike(fragment, etype=None):
    q = '%' + fragment + '%'
    if etype:
        cur.execute('SELECT id, name FROM entities WHERE name ILIKE %s AND entity_type=%s LIMIT 1', (q, etype))
    else:
        cur.execute('SELECT id, name FROM entities WHERE name ILIKE %s LIMIT 1', (q,))
    r = cur.fetchone()
    return (r['id'], r['name']) if r else (None, None)

def find_country(name):
    for etype in ('admin_boundary', 'territory'):
        eid = find(name, etype)
        if eid:
            return eid
    return None

def make_entity(name, etype, src=None):
    eid = find(name, etype)
    if eid:
        print(f'  EXISTS  [{etype}] {name}')
        return eid
    eid = str(uuid.uuid4())
    cur.execute('INSERT INTO entities (id, name, entity_type, source_id) VALUES (%s,%s,%s,%s)',
                (eid, name, etype, src))
    print(f'  CREATE  [{etype}] {name}')
    return eid

def ext_insert(table, entity_id, allowed_cols, **kw):
    cur.execute(f'SELECT 1 FROM {table} WHERE entity_id=%s LIMIT 1', (entity_id,))
    if cur.fetchone():
        return
    filtered = {k: v for k, v in kw.items() if k in allowed_cols and v is not None}
    filtered['entity_id'] = entity_id
    cols = ', '.join(filtered.keys())
    ph   = ', '.join(['%s'] * len(filtered))
    cur.execute(f'INSERT INTO {table} ({cols}) VALUES ({ph})', list(filtered.values()))

def rel(from_id, to_id, rtype, vfrom=None, vto=None, notes=None, src=None):
    cur.execute(
        'SELECT 1 FROM relationships WHERE from_entity_id=%s AND to_entity_id=%s AND relation_type=%s',
        (from_id, to_id, rtype))
    if cur.fetchone():
        return
    cur.execute(
        '''INSERT INTO relationships
           (id, from_entity_id, to_entity_id, relation_type, valid_from, valid_to, notes, source_id)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)''',
        (str(uuid.uuid4()), from_id, to_id, rtype, vfrom, vto, notes, src))

def upsert_ann_block(entity_id, notes):
    """Insert or update a single markdown annotation block for an entity.
    notes = list of (key, value) or (key, value, dtype) tuples.
    The actual annotations table has one row per entity with a content_md blob.
    """
    lines = []
    for note in notes:
        k, v = note[0], note[1]
        if k.lower() in ('wikipedia', 'url', 'source url'):
            lines.append(f'**{k}:** [{v}]({v})')
        else:
            lines.append(f'**{k}:** {v}')
    content = '\n\n'.join(lines)
    cur.execute('SELECT id FROM annotations WHERE entity_id=%s LIMIT 1', (entity_id,))
    row = cur.fetchone()
    if row:
        cur.execute('UPDATE annotations SET content_md=%s WHERE id=%s', (content, row['id']))
    else:
        cur.execute(
            'INSERT INTO annotations (id, entity_id, content_md) VALUES (%s,%s,%s)',
            (str(uuid.uuid4()), entity_id, content))

def get_source():
    cur.execute('SELECT id FROM sources WHERE name=%s LIMIT 1', (SOURCE_TITLE,))
    r = cur.fetchone()
    if r:
        return r['id']
    sid = str(uuid.uuid4())
    cur.execute(
        'INSERT INTO sources (id, name, source_type, description) VALUES (%s,%s,%s,%s)',
        (sid, SOURCE_TITLE, 'research_article',
         'Synthesizes truth commission reports, declassified documents, and scholarly literature '
         'on US interventions in Central America from the Monroe Doctrine to the present.'))
    return sid


# ── Main seed ───────────────────────────────────────────────────────────────

def seed():
    SRC = get_source()
    print(f'\nSource: {SOURCE_TITLE}\nID: {SRC}')

    # Introspect extension table columns once
    PERSON_COLS = get_cols('persons')
    PLACE_COLS  = get_cols('places')
    EVENT_COLS  = get_cols('events')

    # ── PERSONS ──────────────────────────────────────────────────────────────
    print('\n── Persons ──────────────────────────────────────')
    # (name, birth, death, floruit_start, floruit_end, date_label, person_type)
    P_DATA = [
        ('William Walker',                 1824, 1860, 1855, 1857, '1824–1860', 'filibuster/mercenary'),
        ('Samuel Zemurray',                1877, 1961, 1911, 1954, '1877–1961', 'banana magnate/political actor'),
        ('Smedley Butler',                 1881, 1940, 1898, 1933, '1881–1940', 'US Marine General/anti-imperialist'),
        ('Augusto César Sandino',          1895, 1934, 1927, 1934, '1895–1934', 'revolutionary leader'),
        ('Anastasio Somoza García',        1896, 1956, 1936, 1956, '1896–1956', 'dictator'),
        ('Maximiliano Hernández Martínez', 1882, 1966, 1931, 1944, '1882–1966', 'military dictator'),
        ('Agustín Farabundo Martí',        1893, 1932, 1930, 1932, '1893–1932', 'revolutionary organizer'),
        ('Jacobo Árbenz Guzmán',           1913, 1971, 1951, 1954, '1913–1971', 'elected president'),
        ('Carlos Castillo Armas',          1914, 1957, 1954, 1957, '1914–1957', 'coup leader/president'),
        ('Romeo Lucas García',             1924, 2006, 1978, 1982, '1924–2006', 'military dictator'),
        ('Efraín Ríos Montt',              1926, 2018, 1982, 1983, '1926–2018', 'military dictator'),
        ('Juan José Gerardi Conedera',     1922, 1998, None, None, '1922–1998', 'bishop/human rights leader'),
        ('Óscar Arnulfo Romero',           1917, 1980, None, None, '1917–1980', 'archbishop/martyr'),
        ("Roberto D'Aubuisson",            1944, 1992, None, None, '1944–1992', 'military officer/ARENA founder'),
        ('Pedro Joaquín Chamorro',         1924, 1978, None, None, '1924–1978', 'journalist/opposition leader'),
        ('Daniel Ortega',                  1945, None, 1979, None, 'b. 1945',   'revolutionary leader/president'),
        ('Manuel Noriega',                 1934, 2017, 1983, 1989, '1934–2017', 'military dictator/CIA asset'),
        ('John Negroponte',                1939, None, 1981, 1985, 'b. 1939',   'US Ambassador/intelligence official'),
        ('Oliver North',                   1943, None, 1981, 1987, 'b. 1943',   'NSC official/Iran-Contra figure'),
        ('Manuel Zelaya',                  1952, None, 2006, 2009, 'b. 1952',   'elected president'),
    ]

    persons = {}
    for name, birth, death, fs, fe, label, ptype in P_DATA:
        eid = make_entity(name, 'person', SRC)
        persons[name] = eid
        ext_insert('persons', eid, PERSON_COLS,
                   birth_year=birth, death_year=death,
                   floruit_start=fs, floruit_end=fe,
                   date_label=label, person_type=ptype)

    # ── PLACES ───────────────────────────────────────────────────────────────
    # places.geom is NOT NULL; use ST_SetSRID(ST_MakePoint(lon, lat), 4326)
    print('\n── Places ───────────────────────────────────────')
    # (name, place_type, date_label, lon, lat)
    PLACE_DATA = [
        ('El Mozote',     'massacre site',   'El Mozote, Morazán, El Salvador',          -88.1256, 13.5783),
        ('Pantzós',       'massacre site',   'Alta Verapaz, Guatemala',                  -89.6350, 15.3986),
        ('Ixil Triangle', 'conflict zone',   'Nebaj, Chajul, Cotzal — El Quiché, Guatemala', -91.1500, 15.4000),
        ('Río Negro',     'massacre site',   'Baja Verapaz, Guatemala',                  -90.2200, 15.3300),
        ('El Aguacate',   'military airbase','Honduras',                                 -86.9000, 14.2000),
    ]
    places = {}
    for name, ptype, loc, lon, lat in PLACE_DATA:
        eid = make_entity(name, 'place', SRC)
        places[name] = eid
        cur.execute('SELECT 1 FROM places WHERE entity_id=%s LIMIT 1', (eid,))
        if not cur.fetchone():
            cur.execute(
                """INSERT INTO places (entity_id, geom, place_type, date_label)
                   VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s)""",
                (eid, lon, lat, ptype, loc)
            )

    # ── EVENTS ───────────────────────────────────────────────────────────────
    print('\n── Events ───────────────────────────────────────')
    # (name, event_type, event_subtype, year_start, year_end, date_label, fatalities)
    EV_DATA = [
        ('La Matanza (El Salvador)',
         'mass killing', 'state repression',
         1932, 1932, 'January–February 1932', 15000),

        ('Operation PBSUCCESS — Guatemala Coup',
         'CIA covert operation', 'coup',
         1954, 1954, 'June 1954', None),

        ('Pantzós Massacre',
         'massacre', 'anti-indigenous state violence',
         1978, 1978, 'May 29, 1978', 53),

        ('Assassination of Óscar Romero',
         'political assassination', 'targeted killing',
         1980, 1980, 'March 24, 1980', 1),

        ('El Mozote Massacre',
         'massacre', 'counterinsurgency atrocity',
         1981, 1981, 'December 11, 1981', 978),

        ('Río Negro Massacres',
         'massacre', 'genocide/forced displacement',
         1980, 1982, '1980–1982', 444),

        ('CIA Mining of Nicaragua Harbors',
         'covert military operation', 'naval mining',
         1983, 1984, '1983–1984', None),

        ('Iran-Contra Affair',
         'political scandal', 'illegal arms and aid transfer',
         1986, 1987, 'November 1986', None),

        ('Jesuit Murders at UCA El Salvador',
         'political murder', 'counterinsurgency atrocity',
         1989, 1989, 'November 16, 1989', 8),

        ('Operation Just Cause — Panama Invasion',
         'military invasion', 'US military action',
         1989, 1989, 'December 20, 1989', 302),

        ('Assassination of Pedro Joaquín Chamorro',
         'political assassination', 'targeted killing',
         1978, 1978, 'January 10, 1978', 1),

        ('Assassination of Augusto César Sandino',
         'political assassination', 'targeted killing',
         1934, 1934, 'February 1934', 1),

        ('Gerardi Assassination',
         'political assassination', 'targeted killing',
         1998, 1998, 'April 26, 1998', 1),

        ('Ríos Montt Genocide Conviction',
         'legal proceeding', 'criminal conviction',
         2013, 2013, 'May 10, 2013', None),

        ('2009 Honduras Coup',
         'military coup', 'democratic backsliding',
         2009, 2009, 'June 28, 2009', None),

        ('Chixoy Dam Displacement and Río Negro Massacres',
         'forced displacement', 'infrastructure violence',
         1980, 1982, '1980–1982', 400),
    ]

    events = {}
    for name, etype, esubtype, ys, ye, dlabel, fat in EV_DATA:
        eid = make_entity(name, 'event', SRC)
        events[name] = eid
        ext_insert('events', eid, EVENT_COLS,
                   event_type=etype, event_subtype=esubtype,
                   date_year_start=ys, date_year_end=ye,
                   date_label=dlabel, date_precision='year',
                   fatalities=fat)

    # ── COUNTRY REFERENCES ────────────────────────────────────────────────────
    print('\n── Country references ───────────────────────────')
    C = {}
    for country in ['Guatemala', 'El Salvador', 'Honduras', 'Nicaragua', 'Panama']:
        existing = find_country(country)
        if existing:
            cur.execute('SELECT entity_type FROM entities WHERE id=%s', (existing,))
            etype = cur.fetchone()['entity_type']
            print(f'  FOUND   [{etype}] {country}')
            C[country] = existing
        else:
            C[country] = make_entity(country, 'territory', SRC)

    P = persons
    E = events
    L = places

    # ── RELATIONSHIPS ─────────────────────────────────────────────────────────
    print('\n── Relationships ────────────────────────────────')

    # William Walker
    rel(P['William Walker'], C['Nicaragua'], 'RULED', 1856, 1857,
        'Self-installed as president after capturing Granada; recognized by Pierce; '
        'executed by Honduran firing squad September 12 1860', SRC)

    # Zemurray / UFCO / PBSUCCESS
    rel(P['Samuel Zemurray'], E['Operation PBSUCCESS — Guatemala Coup'], 'ALLIED_WITH', None, None,
        'Zemurray lobbied the Dulles brothers and helped finance PBSUCCESS to protect '
        'UFCO landholdings threatened by Árbenz agrarian reform (Decree 900)', SRC)

    # Sandino
    rel(P['Augusto César Sandino'], C['Nicaragua'], 'LOCATED_IN', 1927, 1934,
        'Led guerrilla resistance against US Marine occupation 1927–1933; '
        'surrendered after Marine withdrawal; murdered February 1934', SRC)
    rel(P['Anastasio Somoza García'], P['Augusto César Sandino'], 'DEFEATED', 1934, None,
        "Ordered Sandino's assassination after peace negotiations; "
        'had him seized and shot February 1934', SRC)
    rel(E['Assassination of Augusto César Sandino'], P['Augusto César Sandino'], 'LOCATED_IN', None, None,
        'Sandino was lured to dinner and then abducted and murdered on National Guard orders', SRC)

    # Somoza García
    rel(P['Anastasio Somoza García'], C['Nicaragua'], 'RULED', 1936, 1956,
        'Founded Somoza dynasty; ruled until assassinated 1956; '
        'succeeded by sons Luis then Anastasio Somoza Debayle', SRC)

    # El Salvador / La Matanza
    rel(P['Maximiliano Hernández Martínez'], C['El Salvador'], 'RULED', 1931, 1944, None, SRC)
    rel(P['Agustín Farabundo Martí'], E['La Matanza (El Salvador)'], 'LOCATED_IN', None, None,
        'Led January 1932 uprising with Feliciano Ama; captured before revolt; '
        'executed by firing squad February 1 1932', SRC)
    rel(P['Maximiliano Hernández Martínez'], E['La Matanza (El Salvador)'], 'FOUNDED', None, None,
        'Ordered the mass killings following the January 1932 peasant/indigenous uprising', SRC)
    rel(E['La Matanza (El Salvador)'], C['El Salvador'], 'LOCATED_IN', None, None, None, SRC)

    # Guatemala coup / Árbenz
    rel(P['Jacobo Árbenz Guzmán'], C['Guatemala'], 'RULED', 1951, 1954,
        'Democratically elected; Decree 900 (1952) agrarian reform expropriated uncultivated '
        'UFCO land at declared tax value; overthrown CIA coup June 27 1954', SRC)
    rel(P['Carlos Castillo Armas'], P['Jacobo Árbenz Guzmán'], 'DEFEATED', 1954, None,
        'CIA-backed coup (PBSUCCESS); Árbenz abandoned by officer corps and forced to resign '
        'June 27 1954', SRC)
    rel(P['Carlos Castillo Armas'], P['Jacobo Árbenz Guzmán'], 'SUCCEEDED', 1954, None, None, SRC)
    rel(P['Carlos Castillo Armas'], C['Guatemala'], 'RULED', 1954, 1957,
        'Took power July 1954 following CIA-backed coup; assassinated 1957', SRC)
    rel(E['Operation PBSUCCESS — Guatemala Coup'], C['Guatemala'], 'LOCATED_IN', None, None, None, SRC)

    # Romeo Lucas García
    rel(P['Romeo Lucas García'], C['Guatemala'], 'RULED', 1978, 1982, None, SRC)
    rel(P['Romeo Lucas García'], E['Pantzós Massacre'], 'FOUNDED', None, None,
        "Commanded the army that fired on Q'eqchi' Maya demonstrators at Pantzós, "
        'Alta Verapaz, May 29 1978; opening salvo of mass anti-Maya state violence', SRC)
    rel(E['Pantzós Massacre'], L['Pantzós'], 'LOCATED_IN', None, None, None, SRC)
    rel(E['Pantzós Massacre'], C['Guatemala'], 'LOCATED_IN', None, None, None, SRC)

    # Ríos Montt / genocide
    rel(P['Efraín Ríos Montt'], P['Romeo Lucas García'], 'SUCCEEDED', 1982, None,
        'Seized power in coup March 23 1982', SRC)
    rel(P['Efraín Ríos Montt'], C['Guatemala'], 'RULED', 1982, 1983,
        'Launched scorched-earth genocide against Maya via Plans Victoria 82, Firmeza 83, '
        'Sofía; deposed August 1983', SRC)
    rel(P['Efraín Ríos Montt'], E['Río Negro Massacres'], 'FOUNDED', None, None,
        'Ordered Plan Sofía and related scorched-earth campaigns in Ixil Triangle; '
        'evidence documented in 350-page Plan Sofía cache published by National Security Archive', SRC)
    rel(E['Río Negro Massacres'], C['Guatemala'], 'LOCATED_IN', None, None, None, SRC)
    rel(E['Río Negro Massacres'], L['Río Negro'], 'LOCATED_IN', None, None, None, SRC)
    rel(E['Río Negro Massacres'], L['Ixil Triangle'], 'LOCATED_IN', None, None,
        'Ixil Triangle (Nebaj, Chajul, Cotzal) was the primary zone of scorched-earth operations', SRC)
    rel(E['Ríos Montt Genocide Conviction'], P['Efraín Ríos Montt'], 'DEFEATED', None, None,
        'Convicted May 10 2013 of genocide and crimes against humanity — first head of state '
        "convicted by own country's court for such crimes; conviction vacated procedurally "
        'ten days later; Ríos Montt died 2018 during retrial', SRC)
    rel(E['Chixoy Dam Displacement and Río Negro Massacres'], E['Río Negro Massacres'], 'ALLIED_WITH',
        None, None,
        'World Bank / IDB-financed Chixoy hydroelectric dam displacement of Maya Achí '
        'community triggered the Río Negro massacres', SRC)

    # El Mozote
    rel(E['El Mozote Massacre'], L['El Mozote'], 'LOCATED_IN', None, None, None, SRC)
    rel(E['El Mozote Massacre'], C['El Salvador'], 'LOCATED_IN', None, None, None, SRC)

    # Romero
    rel(P['Óscar Arnulfo Romero'], C['El Salvador'], 'LOCATED_IN', None, None, None, SRC)
    rel(P["Roberto D'Aubuisson"], P['Óscar Arnulfo Romero'], 'DEFEATED', 1980, None,
        "UN Truth Commission concluded D'Aubuisson ordered the assassination of Archbishop "
        'Romero, March 24 1980', SRC)
    rel(E['Assassination of Óscar Romero'], C['El Salvador'], 'LOCATED_IN', None, None, None, SRC)

    # Chamorro / Nicaragua
    rel(P['Pedro Joaquín Chamorro'], C['Nicaragua'], 'LOCATED_IN', None, None, None, SRC)
    rel(E['Assassination of Pedro Joaquín Chamorro'], P['Pedro Joaquín Chamorro'], 'LOCATED_IN',
        None, None, None, SRC)
    rel(E['Assassination of Pedro Joaquín Chamorro'], C['Nicaragua'], 'LOCATED_IN', None, None, None, SRC)

    # Ortega / FSLN
    rel(P['Daniel Ortega'], C['Nicaragua'], 'RULED', 1979, None,
        'FSLN victory July 19 1979 after Somoza exile; led revolutionary junta; '
        'later elected president; now governs as authoritarian ruler', SRC)

    # Contra / Iran-Contra
    rel(E['CIA Mining of Nicaragua Harbors'], C['Nicaragua'], 'LOCATED_IN', None, None, None, SRC)
    rel(P['Oliver North'], E['Iran-Contra Affair'], 'FOUNDED', None, None,
        'NSC operative who coordinated secret Iran arms sales and diversion of proceeds '
        'to Nicaraguan Contras in violation of Boland Amendment', SRC)
    rel(E['Iran-Contra Affair'], C['Nicaragua'], 'LOCATED_IN', None, None, None, SRC)
    rel(E['Iran-Contra Affair'], C['Honduras'], 'LOCATED_IN', None, None,
        'El Aguacate and other Honduran bases were primary Contra staging grounds', SRC)

    # Negroponte / Honduras
    rel(P['John Negroponte'], C['Honduras'], 'LOCATED_IN', 1981, 1985,
        'US Ambassador 1981–1985; oversaw Contra infrastructure build-up; worked with '
        'Álvarez Martínez to create CIA-trained Battalion 3-16 death squad; '
        'reporting on atrocities "conspicuously absent" from cable traffic', SRC)

    # Noriega / Panama
    rel(P['Manuel Noriega'], C['Panama'], 'RULED', 1983, 1989, None, SRC)
    rel(E['Operation Just Cause — Panama Invasion'], P['Manuel Noriega'], 'DEFEATED', None, None,
        'US invasion December 20 1989; Noriega surrendered January 1990; '
        'convicted on US drug trafficking charges', SRC)
    rel(E['Operation Just Cause — Panama Invasion'], C['Panama'], 'LOCATED_IN', None, None, None, SRC)

    # Jesuit murders
    rel(E['Jesuit Murders at UCA El Salvador'], C['El Salvador'], 'LOCATED_IN', None, None, None, SRC)

    # Smedley Butler
    rel(P['Smedley Butler'], C['Nicaragua'], 'LOCATED_IN', 1912, 1912,
        'Served during US Marine occupation; later condemned these wars in War Is a Racket (1935)', SRC)

    # Honduras coup
    rel(P['Manuel Zelaya'], C['Honduras'], 'RULED', 2006, 2009, None, SRC)
    rel(E['2009 Honduras Coup'], P['Manuel Zelaya'], 'DEFEATED', None, None,
        'Military detained and exiled Zelaya June 28 2009; OAS and UN General Assembly '
        'condemned as illegal coup; 2011 Honduran truth commission confirmed its illegality', SRC)
    rel(E['2009 Honduras Coup'], C['Honduras'], 'LOCATED_IN', None, None, None, SRC)

    # Gerardi
    rel(E['Gerardi Assassination'], P['Juan José Gerardi Conedera'], 'LOCATED_IN', None, None, None, SRC)
    rel(E['Gerardi Assassination'], C['Guatemala'], 'LOCATED_IN', None, None, None, SRC)

    # ── ANNOTATIONS ──────────────────────────────────────────────────────────
    print('\n── Annotations ──────────────────────────────────')

    PERSON_ANNS = {
        P['William Walker']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'Captured Granada 1855; installed himself as president; reinstated slavery '
             'September 22 1856; executed by Honduran firing squad September 12 1860'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/William_Walker_(filibuster)'),
        ],
        P['Samuel Zemurray']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'Organized 1911 Honduras coup financing (Bonilla/Lee Christmas operation); later '
             'acquired United Fruit Company (UFCO); helped lobby Dulles brothers for PBSUCCESS '
             'to protect UFCO landholdings expropriated by Árbenz Decree 900'),
            ('Companies', 'Cuyamel Fruit Company; United Fruit Company (UFCO)'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Sam_Zemurray', 'url'),
        ],
        P['Smedley Butler']: [
            ('Source', SOURCE_TITLE),
            ('Key quote',
             '"I spent thirty-three years and four months in active military service and during '
             'that period I spent most of my time as a high class muscle man for Big Business, '
             'for Wall Street and the bankers. I helped make Honduras right for the American '
             'fruit companies in 1903." — War Is a Racket, 1935'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Smedley_Butler', 'url'),
        ],
        P['Augusto César Sandino']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'Led peasant guerrilla war against US Marine occupation 1927–1933 from Nicaraguan '
             'highlands; accepted peace after Marine withdrawal; murdered February 1934 on '
             "Somoza's orders after peace agreement"),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Augusto_César_Sandino', 'url'),
        ],
        P['Anastasio Somoza García']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             "National Guard commander who ordered Sandino's assassination; seized power 1936; "
             'founded family dynasty ruling Nicaragua for 43 years; FDR reported to have said '
             '"He may be a son of a bitch, but he\'s our son of a bitch"'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Anastasio_Somoza_García', 'url'),
        ],
        P['Agustín Farabundo Martí']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'Led 1932 El Salvador peasant/indigenous uprising with Feliciano Ama; captured '
             'before revolt began; executed by firing squad February 1 1932; namesake of '
             'FMLN (Farabundo Martí National Liberation Front)'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Agustín_Farabundo_Martí', 'url'),
        ],
        P['Jacobo Árbenz Guzmán']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'Decree 900 (1952): agrarian reform expropriated uncultivated UFCO land at '
             "UFCO's own declared tax value; targeted by CIA PBSUCCESS after UFCO lobbied "
             'Dulles brothers; resigned June 27 1954; died in exile 1971'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Jacobo_Árbenz', 'url'),
        ],
        P['Efraín Ríos Montt']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'Launched scorched-earth genocide against Maya via Plans Victoria 82, Firmeza 83, '
             "Sofía; first head of state convicted by own country's court (May 10 2013); "
             'conviction vacated procedurally ten days later; died 2018 during retrial'),
            ('CEH finding',
             'Commission for Historical Clarification (Guatemala: Memory of Silence, 1999): '
             '"Agents of the state committed acts of genocide against groups of Mayan people"; '
             '200,000 killed or disappeared; 93% by state forces; 83% victims were Maya; '
             '626 documented army massacres'),
            ('Plan Sofía',
             '350-page cache of military operational orders published by National Security '
             'Archive 2009; documents systematic genocide planning under Ríos Montt'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Efraín_Ríos_Montt', 'url'),
        ],
        P['Juan José Gerardi Conedera']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'Led REMHI project (Recuperación de la Memoria Histórica); Guatemala: Nunca Más '
             'released April 24 1998; Gerardi bludgeoned to death in his garage April 26 1998'),
            ('Conviction',
             '2001: Colonel Byron Lima Estrada, Captain Byron Lima Oliva, Sergeant José Obdulio '
             'Villanueva convicted — first time Guatemalan military tried in civilian court for '
             'such a crime'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Juan_Gerardi_Conedera', 'url'),
        ],
        P['Óscar Arnulfo Romero']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'Day before assassination implored soldiers: "In the name of God, I ask you, '
             'I beg you, I order you, stop the repression"; had written to Carter asking him '
             'to halt military aid to El Salvador'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Óscar_Romero', 'url'),
        ],
        P["Roberto D'Aubuisson"]: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             "Founder of ARENA party; School of the Americas graduate; UN Truth Commission "
             "(From Madness to Hope, 1993) concluded D'Aubuisson ordered Romero's assassination"),
            ('SOA connection',
             'Graduate of the School of the Americas (SOA/WHINSEC); Atlacatl Battalion '
             'soldiers also trained at SOA'),
            ("Wikipedia", "https://en.wikipedia.org/wiki/Roberto_D'Aubuisson", 'url'),
        ],
        P['John Negroponte']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'US Ambassador to Honduras 1981–1985; oversaw Contra infrastructure; worked with '
             'Álvarez Martínez to create CIA-trained Battalion 3-16; reporting on atrocities '
             '"conspicuously absent" from his cable traffic'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/John_Negroponte', 'url'),
        ],
        P['Manuel Noriega']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'School of the Americas graduate; longtime CIA asset; aided Contras; drug trafficking; '
             'had opposition journalist Hugo Spadafora decapitated 1985; ousted by Operation '
             'Just Cause December 1989; convicted on US drug trafficking charges'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Manuel_Noriega', 'url'),
        ],
        P['Oliver North']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'NSC staffer who coordinated Iran-Contra: secret Iran arms sales (~$30M), '
             '~$18M diverted to Nicaraguan Contras in violation of Boland Amendment; '
             'exposed November 1986'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Oliver_North', 'url'),
        ],
        P['Manuel Zelaya']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             'Elected Honduran president; removed in military coup June 28 2009; OAS and UN '
             'General Assembly condemned as illegal; 2011 Honduran truth commission confirmed '
             'its illegality'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Manuel_Zelaya', 'url'),
        ],
        P['Daniel Ortega']: [
            ('Source', SOURCE_TITLE),
            ('Key actions',
             "FSLN (Sandinista) leader; junta from July 19 1979 after Somoza's fall; target "
             "of Reagan's Contra war and harbor mining; returned to power 2006; now governs "
             'as authoritarian ruler'),
            ('Wikipedia', 'https://en.wikipedia.org/wiki/Daniel_Ortega', 'url'),
        ],
    }

    for entity_id, notes in PERSON_ANNS.items():
        upsert_ann_block(entity_id, notes)

    EVENT_ANNS = {
        E['Operation PBSUCCESS — Guatemala Coup']: [
            ('Source', SOURCE_TITLE),
            ('Documentation',
             'CIA internal history: Nick Cullather, Secret History (declassified 1997); '
             'National Security Archive PBSUCCESS collection'),
            ('Corporate conflict of interest',
             'John Foster Dulles (Secretary of State) — former UFCO lawyer; '
             'Allen Dulles (CIA Director) — former UFCO board member; '
             "Ed Whitman (UFCO PR) — husband of Eisenhower's personal secretary"),
            ('Scale',
             'Approximately $5–7M; Castillo Armas had fewer than 200 fighters; '
             'relied on psychological warfare and CIA-piloted bombing runs'),
        ],
        E['El Mozote Massacre']: [
            ('Source', SOURCE_TITLE),
            ('UN Truth Commission finding',
             'From Madness to Hope (1993): "There is full proof that on December 11, 1981, '
             'in the village of El Mozote, units of the Atlácatl Battalion deliberately and '
             'systematically killed a group of more than 200 men, women and children"'),
            ('Victim count',
             'Salvadoran government victim list named 978 individuals, more than half children; '
             'Argentine forensic anthropologists confirmed accounts in 1992'),
            ('Unit responsible',
             'Atlacatl Battalion — US-created and US-trained rapid-response unit; '
             'commanded by Lt. Col. Domingo Monterrosa'),
            ('US response',
             'Reagan administration dismissed reporting by Raymond Bonner (NYT) and '
             'Alma Guillermoprieto (WaPo) as propaganda; Elliott Abrams later called '
             'US El Salvador policy a "fabulous achievement"'),
        ],
        E['La Matanza (El Salvador)']: [
            ('Source', SOURCE_TITLE),
            ('Scope',
             'Targeted Pipil indigenous people so explicitly by dress, language, and appearance '
             'that scholars describe it as ethnocide; survivors abandoned Pipil dress and language '
             'to survive'),
            ('Casualty range',
             'Estimated 10,000–30,000 killed; regime claimed 2,000; revisionist scholarship '
             '(Erik Ching) argues lower figures'),
        ],
        E['Río Negro Massacres']: [
            ('Source', SOURCE_TITLE),
            ('CEH finding',
             'Guatemala: Memory of Silence (1999): "Agents of the state committed acts of '
             'genocide against groups of Mayan people"; 200,000 killed or disappeared; '
             '83% of victims Maya; 626 documented army massacres'),
            ('Legal proceedings',
             'Inter-American Court of Human Rights adjudicated the Chixoy/Río Negro massacres; '
             'ordered reparations from Guatemalan state'),
        ],
        E['CIA Mining of Nicaragua Harbors']: [
            ('Source', SOURCE_TITLE),
            ('ICJ ruling',
             'Nicaragua v. United States (June 27 1986): US violated international law '
             'by training/funding Contras and mining harbors; ordered reparations; '
             'US withdrew from proceedings and vetoed Security Council enforcement; '
             'reparations never paid'),
        ],
        E['Iran-Contra Affair']: [
            ('Source', SOURCE_TITLE),
            ('Amount diverted',
             'Approximately $18M of ~$30M Iran paid for arms; discrepancy of $12–28M '
             'cited by AG Meese'),
            ('Legal outcome',
             'George H.W. Bush pardoned six key figures December 24 1992 including '
             'Caspar Weinberger; Independent Counsel Walsh: '
             '"The Iran-contra cover-up... has now been completed"'),
        ],
        E['Operation Just Cause — Panama Invasion']: [
            ('Source', SOURCE_TITLE),
            ('Casualty dispute',
             'Pentagon: 202 civilians + 314 PDF soldiers; Physicians for Human Rights: '
             '≥302 civilians; Roman Catholic Church: 673 total; Ramsey Clark: ~3,000 '
             'civilian deaths; OAS condemned as violation of international law'),
        ],
        E['2009 Honduras Coup']: [
            ('Source', SOURCE_TITLE),
            ('US role',
             "Hillary Clinton's Hard Choices memoir and emails show State Department worked "
             "to prevent Zelaya's restoration and legitimize elections under de facto "
             'government, breaking with OAS and UN General Assembly position'),
        ],
        E['Gerardi Assassination']: [
            ('Source', SOURCE_TITLE),
            ('Conviction',
             '2001: Colonel Byron Lima Estrada, Captain Byron Lima Oliva, Sergeant José Obdulio '
             'Villanueva convicted — first time in Guatemalan history that military officers '
             'were tried and convicted by a civilian court for such a crime'),
        ],
        E['Pantzós Massacre']: [
            ('Source', SOURCE_TITLE),
            ('Significance',
             "Q'eqchi' Maya peasants marched to Alta Verapaz capital to protest land seizures; "
             'army fired into the crowd; 53 confirmed dead; widely seen as opening of the '
             'mass anti-Maya state violence that would escalate through 1982–83'),
        ],
    }

    for entity_id, notes in EVENT_ANNS.items():
        upsert_ann_block(entity_id, notes)

    PLACE_ANNS = {
        L['El Mozote']: [
            ('Source', SOURCE_TITLE),
            ('Significance',
             'Village in Morazán department, El Salvador; site of December 11 1981 massacre '
             'by Atlacatl Battalion; 978 named victims, majority children; forensically '
             'confirmed 1992'),
        ],
        L['Pantzós']: [
            ('Source', SOURCE_TITLE),
            ('Significance',
             'Alta Verapaz, Guatemala; May 29 1978: army fired on Q\'eqchi\' Maya peasants '
             'demonstrating over land rights; widely seen as opening of mass state anti-Maya '
             'violence in Guatemala'),
        ],
        L['Ixil Triangle']: [
            ('Source', SOURCE_TITLE),
            ('Significance',
             'Municipalities of Nebaj, Chajul, Cotzal — El Quiché, Guatemala; '
             'primary zone of Ríos Montt scorched-earth genocide 1982–1983; '
             'targeted Ixil Maya under Plans Victoria 82, Firmeza 83, and Sofía'),
        ],
        L['Río Negro']: [
            ('Source', SOURCE_TITLE),
            ('Significance',
             'Baja Verapaz; Maya Achí community massacred 1980–1982 after resisting '
             'displacement for Chixoy hydroelectric dam (World Bank / IDB financed); '
             '>400 killed; Inter-American Court ordered reparations'),
        ],
        L['El Aguacate']: [
            ('Source', SOURCE_TITLE),
            ('Significance',
             'Honduran airbase used as primary Contra staging ground during 1980s; '
             'operated under Negroponte/Álvarez Martínez; disappeared bodies found '
             'at site after the war'),
        ],
    }

    for entity_id, notes in PLACE_ANNS.items():
        upsert_ann_block(entity_id, notes)

    print(f'\n── Summary ──────────────────────────────────────')
    print(f'  Persons:    {len(persons)}')
    print(f'  Places:     {len(places)}')
    print(f'  Events:     {len(events)}')
    print(f'  Countries:  {len(C)}')


# ── Entry point ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    try:
        seed()
        if DRY_RUN:
            print('\n[DRY RUN] Rolling back — no changes persisted.')
            conn.rollback()
        else:
            conn.commit()
            print('\n✓ All changes committed to database.')
    except Exception as exc:
        conn.rollback()
        import traceback
        print(f'\nERROR: {exc}')
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()
