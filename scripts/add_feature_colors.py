#!/usr/bin/env python3
"""
Add per-feature `color` properties to GeoJSON layers for categorical display.
Run from the project root:  python3 scripts/add_feature_colors.py
"""
import json, math, os, re

BASE = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')

# ── Color math ──────────────────────────────────────────────────────────────
def hsl_hex(h, s, l):
    h = h % 360; s /= 100; l /= 100
    c = (1 - abs(2*l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    if   h < 60:  r,g,b = c,x,0
    elif h < 120: r,g,b = x,c,0
    elif h < 180: r,g,b = 0,c,x
    elif h < 240: r,g,b = 0,x,c
    elif h < 300: r,g,b = x,0,c
    else:          r,g,b = c,0,x
    return '#{:02x}{:02x}{:02x}'.format(int((r+m)*255), int((g+m)*255), int((b+m)*255))

def palette(n, sat=58, l_lo=38, l_hi=60, hue_start=20):
    """N evenly-spaced hues, each at the mid-lightness for use as legend swatch."""
    hues = [(hue_start + i * 360 / n) % 360 for i in range(n)]
    return [hsl_hex(h, sat, (l_lo + l_hi) / 2) for h in hues], hues

def group_shades(hue, sat, n_items, l_lo=36, l_hi=58):
    """Return n_items lightness-varied shades of a single hue."""
    if n_items == 1:
        return [hsl_hex(hue, sat, (l_lo + l_hi) / 2)]
    return [hsl_hex(hue, sat, l_lo + i * (l_hi - l_lo) / (n_items - 1)) for i in range(n_items)]

# ── Generic processor ────────────────────────────────────────────────────────
def color_by_property(features, group_field, item_field=None, sat=58, l_lo=36, l_hi=58):
    """
    Assign colors grouped by group_field, varying shades per item_field within each group.
    Returns (legend_entries, repr_colors_by_group)
    """
    if item_field is None:
        item_field = group_field

    groups = {}
    for f in features:
        p = f.get('properties', {})
        g = (p.get(group_field) or 'Other').strip()
        v = (p.get(item_field)  or g).strip()
        groups.setdefault(g, [])
        if v not in groups[g]:
            groups[g].append(v)

    sorted_groups = sorted(groups)
    n = len(sorted_groups)
    hue_start = 20
    hues = [(hue_start + i * 360 / n) % 360 for i in range(n)]

    # mid-lightness representative color per group
    repr_color = {}
    item_color_map = {}  # item_value → hex
    legend = []

    for gi, grp in enumerate(sorted_groups):
        h = hues[gi]
        items = sorted(groups[grp])
        shades = group_shades(h, sat, len(items), l_lo, l_hi)
        mid = hsl_hex(h, sat, (l_lo + l_hi) / 2)
        repr_color[grp] = mid
        for item, shade in zip(items, shades):
            item_color_map[item] = shade
        legend.append({'label': grp, 'value': grp, 'color': mid, 'count': len(items)})

    for f in features:
        p = f.get('properties', {})
        key = (p.get(item_field) or p.get(group_field) or 'Other').strip()
        p['color'] = item_color_map.get(key, '#888888')

    return legend, repr_color

def save(fname, data):
    path = os.path.join(BASE, fname)
    with open(path, 'w') as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'  Saved {fname}')

def load(fname):
    with open(os.path.join(BASE, fname)) as fh:
        return json.load(fh)

def print_legend(name, legend):
    print(f'\n// {name} colorLegend:')
    print('colorLegend: [')
    for e in legend:
        cnt = f", count: {e['count']}" if 'count' in e else ''
        print(f"  {{ label: '{e['label']}', value: '{e['value']}', color: '{e['color']}'{cnt} }},")
    print('],')

# ── Dialect family lookup ────────────────────────────────────────────────────
DIALECT_FAMILY = {
    # Mayan
    'Awakateko, Aguacatec, Aguateco': 'Mayan',
    'Chol': 'Mayan', 'Choltí': 'Mayan', 'Chortí': 'Mayan', 'Chuj': 'Mayan',
    'Itzá': 'Mayan', 'Ixil': 'Mayan', 'Kaqchikel': 'Mayan', 'Kiché, Quiché': 'Mayan',
    'Mam': 'Mayan', 'Mopán': 'Mayan',
    'Poqomam, Pokomam': 'Mayan', 'Poqomchí, Pokomchí': 'Mayan',
    'Qanjobal, Kanjobal': 'Mayan', 'Qeqchí, Kekchí': 'Mayan', 'Sakapulteko': 'Mayan',
    'Sipakapenyo, Sipacapense': 'Mayan', 'Teko, Teco': 'Mayan', 'Tojolabal': 'Mayan',
    'Tzeltal': 'Mayan', 'Tzuljil': 'Mayan', 'Tzotzil': 'Mayan',
    'Uspanteko, Uspanteco': 'Mayan', 'Wasteko, Huasteco': 'Mayan',
    'Yokotán, Chontal Maya': 'Mayan',
    'Yukateko, Yucatec Proper , Yucateco Proper': 'Mayan',
    # Nahuan
    'Nawa': 'Nahuan', 'Central Nawa, Central Nahuatl': 'Nahuan',
    'Eastern Nawa, Eastern Nahuatl': 'Nahuan', 'Western Nawa, Western Nahuatl': 'Nahuan',
    'Northern Nawa, Northern Nahuatl': 'Nahuan', 'Pipil': 'Nahuan', 'Pochuteko': 'Nahuan',
    # Uto-Aztecan (non-Nahuan)
    'Wichol, Huichol': 'Uto-Aztecan', 'Kora, Cora': 'Uto-Aztecan',
    # Zapotecan
    'Sapoteko, Zapoteco': 'Zapotecan', 'Central Sapoteko, Central Zapoteco': 'Zapotecan',
    'Eastern Sapoteko, Eastern Zapoteco': 'Zapotecan',
    'Northern Sapoteko, Northern Zapoteco': 'Zapotecan',
    'Southern Sapoteko, Southern Zapoteco': 'Zapotecan',
    'Western Sapoteko, Western Zapoteco': 'Zapotecan',
    # Mixtecan
    'Northern Misteko, Northern Mixteco': 'Mixtecan', 'Southern Misteko, Southern Mixteco': 'Mixtecan',
    'Triki, Trique': 'Mixtecan', 'Amusgo': 'Mixtecan', 'Amusgo, Amuzgo': 'Mixtecan',
    'Chatino': 'Mixtecan',
    # Otomian
    'Otomí': 'Otomian', 'Northwestern Otomí': 'Otomian', 'Northeastern Otomí': 'Otomian',
    'Western Otomí': 'Otomian', 'Jalisco Otomí': 'Otomian', 'Ixtenco Otomí': 'Otomian',
    'Tilapa Otomí': 'Otomian', 'Masawa, Mazahua': 'Otomian',
    'Matlatzinkan, Matlatzinca, Ocuilteco': 'Otomian', 'Pame, Pamean': 'Otomian',
    'Pinome': 'Otomian', 'Tekwexe': 'Otomian',
    # Popolocan
    'Masateko, Mazateco': 'Popolocan', 'Kwikateko, Cuicateco': 'Popolocan',
    'Eastern Popoloka, Eastern Popoloca': 'Popolocan',
    'Northern Popoloka, Northern Popoloca': 'Popolocan',
    'Western Popoloka, Western Popoloca': 'Popolocan',
    'Chocho Proper': 'Popolocan', 'Chumbia': 'Popolocan',
    # Mixe-Zoquean
    'Mije, Mixe': 'Mixe-Zoquean', 'Oluta Mijean, Oluteko, Oluta Popoluc': 'Mixe-Zoquean',
    'Sayula Mijean, Sayulteko, Sayula Popoluca': 'Mixe-Zoquean',
    'Tapachula Mijean, Tapachulteko, Mixe': 'Mixe-Zoquean',
    'Eastern Soke, Zoque': 'Mixe-Zoquean', 'Western Soke, Zoque': 'Mixe-Zoquean',
    'Highland Sokean': 'Mixe-Zoquean', 'Isthmus Sokean': 'Mixe-Zoquean',
    # Totonacan
    'Totonako, Totonaco': 'Totonacan', 'Tepewa, Tepehua': 'Totonacan',
    # Lencan
    'Kare Lenka, Kare Lenca': 'Lencan', 'Kolo Lenka, Kolo Lenca': 'Lencan',
    'Lenka Proper, Lenca Proper': 'Lencan', 'Serkin Lenka, Serkin Lenca': 'Lencan',
    'Kabil, Cabil': 'Lencan',
    # Chinantec
    'Chinanteko, Chinanteco': 'Chinantec',
    # Tlapanec
    'Tlapaneko, Tlapaneco': 'Tlapanec', 'Sutiaba': 'Tlapanec',
    # Chiapanec / Mangue
    'Chiapaneko, Chiapaneco': 'Chiapanec', 'Chorotega': 'Chiapanec',
    # Other small families
    'Eastern Tol': 'Tol', 'Western Tol': 'Tol',
    'Tolimeko, Tolimeco': 'Tol',
    'Shinkan, Xinca': 'Xincan',
    'Wavi, Huave': 'Huave',
    'Kakaopera, Cacaopera, Misumalpan': 'Misumalpan',
    'Kotoke, Cotoque': 'Misumalpan',
    'Chontal (Of Oxaca)': 'Other',
    'Kwitlateko, Cuitlateco': 'Other',
    'Koka': 'Other',
    '?Kaskan': 'Other',
    '?Tekockin': 'Other',
    'No label': 'Other',
}

# Ordered families so hue assignment is deterministic and culturally sensible
FAMILY_ORDER = [
    'Mayan', 'Nahuan', 'Uto-Aztecan',
    'Zapotecan', 'Mixtecan', 'Otomian', 'Popolocan', 'Chinantec', 'Tlapanec', 'Chiapanec',
    'Mixe-Zoquean', 'Totonacan',
    'Lencan', 'Misumalpan',
    'Tol', 'Xincan', 'Huave',
    'Other',
]
# Fixed hues for each family (chosen for perceptual distinctness)
FAMILY_HUE = {
    'Mayan':       225,
    'Nahuan':       18,
    'Uto-Aztecan':  52,
    'Zapotecan':   125,
    'Mixtecan':     80,
    'Otomian':      42,
    'Popolocan':   168,
    'Chinantec':   295,
    'Tlapanec':    185,
    'Chiapanec':   320,
    'Mixe-Zoquean':270,
    'Totonacan':   345,
    'Lencan':       12,
    'Misumalpan':   35,
    'Tol':         195,
    'Xincan':      240,
    'Huave':       155,
    'Other':       220,
}

# ── Process: Language Dialects ───────────────────────────────────────────────
def process_dialects():
    print('\n=== language-dialects.geojson ===')
    d = load('language-dialects.geojson')
    feats = d['features']

    # Add family field
    unmatched = set()
    for f in feats:
        name = (f.get('properties', {}).get('name') or '').strip()
        family = DIALECT_FAMILY.get(name, 'Other')
        if family == 'Other' and name not in DIALECT_FAMILY:
            unmatched.add(name)
        f['properties']['family'] = family

    if unmatched:
        print(f'  Unmatched dialect names (→ Other): {sorted(unmatched)}')

    # Group by family and assign colors
    family_items = {}
    for f in feats:
        p = f['properties']
        fam = p['family']
        name = p.get('name', '').strip()
        family_items.setdefault(fam, [])
        if name and name not in family_items[fam]:
            family_items[fam].append(name)

    # Sort items within each family alphabetically
    for fam in family_items:
        family_items[fam].sort()

    # Assign colors
    item_color = {}
    legend = []
    for fam in FAMILY_ORDER:
        if fam not in family_items:
            continue
        h = FAMILY_HUE.get(fam, 220)
        items = family_items[fam]
        shades = group_shades(h, 60, len(items), l_lo=35, l_hi=60)
        for item, shade in zip(items, shades):
            item_color[item] = shade
        mid = hsl_hex(h, 60, 48)
        legend.append({'label': fam, 'value': fam, 'color': mid, 'count': len(items)})

    for f in feats:
        p = f['properties']
        name = (p.get('name') or '').strip()
        p['color'] = item_color.get(name, '#888888')

    save('language-dialects.geojson', d)
    print_legend('language-dialects', legend)

# ── Process: Language Families ───────────────────────────────────────────────
def process_language_families():
    print('\n=== language-families.geojson ===')
    d = load('language-families.geojson')
    feats = d['features']
    legend, _ = color_by_property(feats, 'name', sat=62, l_lo=38, l_hi=58)
    save('language-families.geojson', d)
    print_legend('language-families', legend)

# ── Process: Classical Empires ───────────────────────────────────────────────
def process_classical_empires():
    print('\n=== classical-empires.geojson ===')
    d = load('classical-empires.geojson')
    feats = d['features']
    # 3 names: Mayan, Teotihuacan, Zapotec — assign fixed meaningful colors
    COLOR_MAP = {
        'Mayan':       '#4a6fd4',  # blue
        'Teotihuacan': '#d4813a',  # amber
        'Zapotec':     '#3d9e52',  # green
    }
    legend = []
    for f in feats:
        p = f['properties']
        name = (p.get('name') or '').strip()
        p['color'] = COLOR_MAP.get(name, '#888888')
    for name, color in COLOR_MAP.items():
        legend.append({'label': name, 'value': name, 'color': color})
    save('classical-empires.geojson', d)
    print_legend('classical-empires', legend)

# ── Process: Post-Classical Empires ─────────────────────────────────────────
def process_postclassical_empires():
    print('\n=== postclassical-empires.geojson ===')
    d = load('postclassical-empires.geojson')
    feats = d['features']
    legend, _ = color_by_property(feats, 'name', sat=65, l_lo=38, l_hi=56)
    save('postclassical-empires.geojson', d)
    print_legend('postclassical-empires', legend)

# ── Process: Maya Culture Areas ──────────────────────────────────────────────
def process_maya_culture_areas():
    print('\n=== maya-culture-areas.geojson ===')
    d = load('maya-culture-areas.geojson')
    feats = d['features']
    legend, _ = color_by_property(feats, 'name', sat=58, l_lo=38, l_hi=56)
    save('maya-culture-areas.geojson', d)
    print_legend('maya-culture-areas', legend)

# ── Process: Conflict Events ─────────────────────────────────────────────────
def process_conflict_events():
    print('\n=== conflict-events.geojson ===')
    d = load('conflict-events.geojson')
    feats = d['features']
    # 6 event_subtypes with meaningful colors
    COLOR_MAP = {
        'Battles':                        '#dc2626',  # red
        'Explosions/Remote violence':      '#d97706',  # amber
        'Violence against civilians':      '#7c2d12',  # dark red-brown
        'Riots':                          '#9333ea',  # purple
        'Protests':                        '#2563eb',  # blue
        'Strategic developments':          '#059669',  # green
    }
    legend = []
    for f in feats:
        p = f['properties']
        sub = (p.get('event_subtype') or '').strip()
        p['color'] = COLOR_MAP.get(sub, '#888888')
    for sub, color in COLOR_MAP.items():
        legend.append({'label': sub, 'value': sub, 'color': color})
    save('conflict-events.geojson', d)
    print_legend('conflict-events', legend)

# ── Process: Maya Settlement Groups ─────────────────────────────────────────
def process_maya_settlement_groups():
    print('\n=== maya-settlement-groups.geojson ===')
    d = load('maya-settlement-groups.geojson')
    feats = d['features']

    # Name pattern: "<Site> — <large|medium> settlement group"
    # Extract site name and size
    SITES = ['Chactun', 'EREDD', 'GLiHT-SouthCamp', 'Holmul', 'La Corona', 'Tikal']
    SITE_HUE = {s: hue for s, hue in zip(SITES, [20, 80, 140, 200, 260, 320])}

    for f in feats:
        p = f['properties']
        name = p.get('name', '')
        site = 'Other'
        size = 'large'
        for s in SITES:
            if name.startswith(s):
                site = s
                break
        if 'medium' in name.lower():
            size = 'medium'
        p['site'] = site
        h = SITE_HUE.get(site, 220)
        lightness = 40 if size == 'large' else 58
        p['color'] = hsl_hex(h, 62, lightness)

    legend = []
    for site in SITES:
        h = SITE_HUE[site]
        legend.append({'label': site, 'value': site, 'color': hsl_hex(h, 62, 49)})
    save('maya-settlement-groups.geojson', d)
    print_legend('maya-settlement-groups', legend)

# ── Process: Ecoregions ───────────────────────────────────────────────────────
def process_ecoregions():
    print('\n=== ecoregions.geojson ===')
    d = load('ecoregions.geojson')
    feats = d['features']

    # Classify ecoregion names into biome groups
    BIOME_KEYWORDS = [
        ('Dry Forest',        ['dry forest', 'dry shrubland', 'dry woodland']),
        ('Moist Forest',      ['moist forest', 'wet forest', 'rainforest', 'rain forest']),
        ('Montane Forest',    ['montane', 'cloud forest', 'pine-oak', 'pine oak']),
        ('Tropical Forest',   ['tropical', 'subtropical']),
        ('Mangroves',         ['mangrove']),
        ('Wetlands',          ['wetland', 'flooded', 'swamp']),
        ('Grassland/Savanna', ['grassland', 'savanna', 'shrub', 'scrub', 'xeric']),
        ('Marine/Coastal',    ['coastal', 'reef', 'marine']),
    ]
    BIOME_HUE = {
        'Dry Forest':         42,
        'Moist Forest':      120,
        'Montane Forest':    170,
        'Tropical Forest':    85,
        'Mangroves':         150,
        'Wetlands':          195,
        'Grassland/Savanna':  55,
        'Marine/Coastal':    210,
        'Other':             280,
    }

    biome_items = {}
    for f in feats:
        p = f['properties']
        name = (p.get('name') or '').lower()
        biome = 'Other'
        for b, kws in BIOME_KEYWORDS:
            if any(kw in name for kw in kws):
                biome = b
                break
        p['biome'] = biome
        biome_items.setdefault(biome, [])
        feat_name = p.get('name', '').strip()
        if feat_name not in biome_items[biome]:
            biome_items[biome].append(feat_name)

    # Assign colors: hue from biome, lightness varies per feature within biome
    item_color = {}
    for biome, items in biome_items.items():
        h = BIOME_HUE.get(biome, 220)
        items.sort()
        shades = group_shades(h, 55, len(items))
        for item, shade in zip(items, shades):
            item_color[item] = shade

    for f in feats:
        p = f['properties']
        feat_name = (p.get('name') or '').strip()
        p['color'] = item_color.get(feat_name, '#888888')

    biome_legend = []
    for b, h in BIOME_HUE.items():
        if b in biome_items:
            biome_legend.append({'label': b, 'value': b, 'color': hsl_hex(h, 55, 48), 'count': len(biome_items[b])})
    save('ecoregions.geojson', d)
    print_legend('ecoregions', biome_legend)

# ── Process: Culturally Significant Species ──────────────────────────────────
def process_species():
    print('\n=== culturally-significant-species.geojson ===')
    d = load('culturally-significant-species.geojson')
    feats = d['features']
    COLOR_MAP = {
        'Panthera':    '#d97706',  # amber — jaguar
        'Pharomachrus':'#059669',  # green — quetzal
    }
    legend = []
    for f in feats:
        p = f['properties']
        sub = (p.get('subtype') or '').strip()
        p['color'] = COLOR_MAP.get(sub, '#888888')
    for sub, color in COLOR_MAP.items():
        legend.append({'label': sub, 'value': sub, 'color': color})
    save('culturally-significant-species.geojson', d)
    print_legend('culturally-significant-species', legend)

# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print('Adding per-feature color properties to GeoJSON layers...')
    process_dialects()
    process_language_families()
    process_classical_empires()
    process_postclassical_empires()
    process_maya_culture_areas()
    process_conflict_events()
    process_maya_settlement_groups()
    process_ecoregions()
    process_species()
    print('\nDone. Paste the colorLegend arrays above into src/layers/index.js.')
