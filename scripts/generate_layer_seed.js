#!/usr/bin/env node
// Generates Phase I seed SQL (sources + layer_definitions) from the layer registry.
// Run from project root: node scripts/generate_layer_seed.js
// Paste the output into the Supabase SQL Editor after phase1_schema.sql.

import { LAYER_REGISTRY } from '../src/layers/index.js'

// ── Entity type per layer ─────────────────────────────────────────────────
const ENTITY_TYPE = {
  'sites':                          'place',
  'maya-inscriptions':              'place',
  'inah-archaeological-zones':      'place',
  'unesco-world-heritage':          'place',
  'lidar-surveys-opentopography':   'place',
  'classical-empires':              'territory',
  'postclassical-empires':          'territory',
  'maya-culture-areas':             'territory',
  'mayan-sites':                    'place',
  'aztec-villages':                 'place',
  'language-families':              'territory',
  'language-dialects':              'territory',
  'lidar-coverage':                 'territory',
  'lidar-coverage-2022':            'territory',
  'maya-settlement-groups':         'place',
  'pacunam-survey-units':           'territory',
  'la-milpa':                       'place',
  'pulltrouser-swamp':              'place',
  'pulltrouser-swamp-points':       'place',
  'becan':                          'place',
  'becan-points':                   'place',
  'volcanoes':                      'geo_feature',
  'faults-central-america':         'geo_feature',
  'faults-mexico':                  'geo_feature',
  'earthquakes':                    'event',
  'major-rivers':                   'geo_feature',
  'major-lakes':                    'geo_feature',
  'hurricane-tracks':               'geo_feature',
  'coral-reefs':                    'geo_feature',
  'ramsar-wetlands':                'geo_feature',
  'ecoregions':                     'territory',
  'mangroves-2020':                 'geo_feature',
  'protected-areas':                'territory',
  'culturally-significant-species': 'geo_feature',
  'conflict-events':                'event',
  'admin2-boundaries':              'admin_boundary',
  'urban-areas':                    'place',
  'major-roads':                    'geo_feature',
  'artifacts':                      'place',
}

function esc(s) {
  return (s ?? '').toString().replace(/'/g, "''")
}

function bool(v) {
  return v ? 'true' : 'false'
}

// Collect unique sources by URL
const sourceMap = new Map()
for (const layer of LAYER_REGISTRY) {
  if (layer.sourceUrl && !sourceMap.has(layer.sourceUrl)) {
    sourceMap.set(layer.sourceUrl, {
      name:        layer.label,
      url:         layer.sourceUrl,
      description: layer.description ?? '',
    })
  }
}

const lines = [
  '-- ============================================================',
  '-- Phase I seed: sources + layer_definitions',
  '-- Generated from src/layers/index.js',
  '-- Run in Supabase SQL Editor AFTER phase1_schema.sql',
  '-- ============================================================',
  '',
  '-- Sources',
  'insert into public.sources (name, source_type, url, description) values',
]

const srcRows = Array.from(sourceMap.values()).map(s =>
  `  ('${esc(s.name)}', 'dataset', '${esc(s.url)}', '${esc(s.description)}')`
)
lines.push(srcRows.join(',\n') + ';')
lines.push('')

// Layer definitions
lines.push('-- Layer definitions')
lines.push('insert into public.layer_definitions')
lines.push('  (id, label, description, entity_type, mapbox_type, color,')
lines.push('   visible_default, disabled, display_order, source_id)')
lines.push('values')

const layerRows = LAYER_REGISTRY.map((layer, i) => {
  const entityType = ENTITY_TYPE[layer.id] ?? 'place'

  const sourceRef = layer.sourceUrl
    ? `(select id from public.sources where url = '${esc(layer.sourceUrl)}' limit 1)`
    : 'null'

  if (!ENTITY_TYPE[layer.id]) {
    process.stderr.write(`WARNING: no entity_type mapped for layer '${layer.id}' — defaulting to 'place'\n`)
  }

  return (
    `  (\n` +
    `    '${layer.id}',\n` +
    `    '${esc(layer.label)}',\n` +
    `    '${esc(layer.description)}',\n` +
    `    '${entityType}',\n` +
    `    '${layer.mapboxType}',\n` +
    `    '${layer.color}',\n` +
    `    ${bool(layer.visible)},\n` +
    `    ${bool(layer.disabled)},\n` +
    `    ${i},\n` +
    `    ${sourceRef}\n` +
    `  )`
  )
})

lines.push(layerRows.join(',\n') + ';')

console.log(lines.join('\n'))
