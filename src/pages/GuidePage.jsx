import { useState } from 'react'

const SECTIONS = [
  { id: 'map',          label: 'Map' },
  { id: 'timeline',     label: 'Timeline' },
  { id: 'admin',        label: 'Admin' },
  { id: 'stories',      label: 'Stories' },
  { id: 'data-requests',label: 'Data Requests' },
  { id: 'explorer',     label: 'Data Explorer' },
  { id: 'viewer',       label: 'Public Story Viewer' },
]

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: 52 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px', paddingBottom: 10, borderBottom: '2px solid #e0e4f0' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Step({ n, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
      <span style={{
        flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
        background: '#2563eb', color: '#fff',
        fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      <span style={{ lineHeight: 1.55, paddingTop: 2 }}>{children}</span>
    </div>
  )
}

function Tip({ children }) {
  return (
    <div style={{
      background: '#eff6ff', borderLeft: '3px solid #2563eb',
      borderRadius: 4, padding: '10px 14px',
      fontSize: 13, lineHeight: 1.55, marginTop: 12, marginBottom: 12,
    }}>
      <strong style={{ color: '#2563eb' }}>Tip: </strong>{children}
    </div>
  )
}

function Code({ children }) {
  return (
    <code style={{
      fontFamily: 'ui-monospace, monospace', fontSize: 12,
      background: '#f1f5f9', border: '1px solid #e0e4f0',
      borderRadius: 3, padding: '1px 5px',
    }}>{children}</code>
  )
}

function Block({ children }) {
  return (
    <pre style={{
      fontFamily: 'ui-monospace, monospace', fontSize: 12,
      background: '#f1f5f9', border: '1px solid #e0e4f0',
      borderRadius: 6, padding: '12px 14px',
      overflowX: 'auto', lineHeight: 1.55,
      margin: '12px 0',
    }}>{children}</pre>
  )
}

function Badge({ color, children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
      background: `${color}22`, color,
      textTransform: 'uppercase', marginRight: 4,
    }}>{children}</span>
  )
}

export default function GuidePage() {
  const [active, setActive] = useState('map')

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#f5f7fb' }}>
      {/* Sidebar nav */}
      <nav style={{
        width: 180, flexShrink: 0,
        borderRight: '1px solid #e0e4f0',
        padding: '28px 0',
        overflowY: 'auto',
        background: '#fff',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7a82a8', padding: '0 20px 10px' }}>
          Guide
        </div>
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={() => setActive(s.id)}
            style={{
              display: 'block',
              padding: '7px 20px',
              fontSize: 13,
              fontWeight: active === s.id ? 600 : 400,
              color: active === s.id ? '#2563eb' : '#1a1d2e',
              background: active === s.id ? '#eff6ff' : 'transparent',
              borderLeft: active === s.id ? '3px solid #2563eb' : '3px solid transparent',
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (active !== s.id) e.currentTarget.style.background = '#f5f7fb' }}
            onMouseLeave={e => { if (active !== s.id) e.currentTarget.style.background = 'transparent' }}
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '36px 48px 60px', maxWidth: 760 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>How to Use This Application</h1>
        <p style={{ fontSize: 14, color: '#7a82a8', margin: '0 0 40px', lineHeight: 1.6 }}>
          A guide to the Mesoamerica Interactive Map — exploring layers, building timelines, managing entities, and publishing stories.
        </p>

        {/* MAP */}
        <Section id="map" title="Map">
          <p style={{ margin: '0 0 16px', lineHeight: 1.65, fontSize: 14 }}>
            The map is the home view. It displays 39 thematic layers covering archaeology, languages, ecology, conflict, and modern boundaries across Mesoamerica.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Layer Panel</h3>
          <Step n={1}>Click the <strong>Layers</strong> button (stack icon) in the top-left to open the layer panel.</Step>
          <Step n={2}>Toggle any layer on or off with its checkbox. Layers are grouped by theme: Archaeology, Languages, Ecology, Conflict, Modern Administrative, and more.</Step>
          <Step n={3}>Drag layers up and down in the panel to control draw order — layers higher in the list render on top.</Step>
          <Step n={4}>Layers with a color legend display colored chips below their description when active. Each chip shows the category value and entity count.</Step>
          <Tip>Some polygon layers are auto-colored by category (empire name, language family, biome type). The color legend in the panel explains each chip.</Tip>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Clicking Features</h3>
          <Step n={1}>Click any visible map feature to open a detail panel on the right with name, type, source, and layer information.</Step>
          <Step n={2}>The detail panel includes a link to the entity record in Admin if the feature is part of the knowledge graph.</Step>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Map Type Overlays</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            Switch between four base styles from the Layer Panel: <strong>Default</strong>, <strong>Topographic</strong>, <strong>3D Terrain</strong>, and <strong>Population</strong> (choropleth).
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Draw Tools</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            Draw custom shapes directly on the map using the toolbar in the top-right corner.
          </p>
          <Step n={1}>Select Polygon, Point, or Freehand from the draw toolbar.</Step>
          <Step n={2}>Click to place vertices; double-click to finish a polygon.</Step>
          <Step n={3}>Use <strong>Undo / Redo</strong> buttons or Ctrl+Z / Ctrl+Shift+Z.</Step>
          <Step n={4}>Drawn shapes are saved as <strong>User Layers</strong> and persist in your browser across sessions.</Step>
          <Step n={5}>Export your user layers as GeoJSON, or import a GeoJSON file to add your own data.</Step>
          <Tip>Enable <strong>Snap to boundary</strong> to lock new vertices to existing layer edges — useful for tracing territory borders precisely.</Tip>
        </Section>

        {/* TIMELINE */}
        <Section id="timeline" title="Timeline">
          <p style={{ margin: '0 0 16px', lineHeight: 1.65, fontSize: 14 }}>
            The Timeline page renders a multi-entity historical timeline from Supabase data. Each entity type appears as a horizontal bar on a shared year axis.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Entity Types</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            <Badge color="#7c3aed">person</Badge>
            <Badge color="#dc2626">event</Badge>
            <Badge color="#059669">place</Badge>
            <Badge color="#d97706">territory</Badge>
            <Badge color="#9333ea">admin boundary</Badge>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            Thin connector lines show <strong>RULED</strong> relationships linking persons to territories.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Era Filters</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            Use the era buttons to zoom to a historical period:
          </p>
          <ul style={{ fontSize: 14, lineHeight: 1.8, margin: '0 0 16px', paddingLeft: 20 }}>
            <li><strong>Preclassic</strong> — 900 BCE – 350 CE</li>
            <li><strong>Classic</strong> — 150 – 1000 CE</li>
            <li><strong>Postclassic</strong> — 800 – 1600 CE</li>
            <li><strong>Colonial</strong> — 1450 – 1850 CE</li>
            <li><strong>Modern</strong> — 1800 – 2030 CE</li>
          </ul>
          <Tip>Choose entity type checkboxes to show only the types you need. The timeline can get dense with all types enabled across all eras.</Tip>
        </Section>

        {/* ADMIN */}
        <Section id="admin" title="Admin Panel">
          <p style={{ margin: '0 0 16px', lineHeight: 1.65, fontSize: 14 }}>
            The Admin panel is the full knowledge-graph editor. It is password-protected. The password is set by the site administrator in the environment configuration.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Entity Browser</h3>
          <Step n={1}>After logging in, the <strong>Dashboard</strong> shows entity counts per type as mini bar charts. Click a type pill to filter the browser to that type.</Step>
          <Step n={2}>Search for any entity by name using the search box. Full-text search is active — partial and fuzzy matches work.</Step>
          <Step n={3}>Click any entity in the results list to open its <strong>detail record</strong> on the right.</Step>

          <h4 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 8px', color: '#7a82a8' }}>Entity Record</h4>
          <ul style={{ fontSize: 14, lineHeight: 1.8, margin: '0 0 12px', paddingLeft: 20 }}>
            <li>Click the <strong>pencil icon</strong> next to the name to edit it inline.</li>
            <li>Extension fields (birth year, event type, coordinates, etc.) appear below the name and are also inline-editable.</li>
            <li>The <strong>Relationships</strong> section lists typed edges to other entities. Use "Add relationship" to create a new one — search for the target entity by name.</li>
            <li>The <strong>Annotations</strong> section holds freeform key-value notes. Supported types: text, number, date, URL, markdown.</li>
          </ul>

          <h4 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 8px', color: '#7a82a8' }}>Creating Entities</h4>
          <Step n={1}>Click the <strong>+ New</strong> button at the top of the sidebar.</Step>
          <Step n={2}>Enter a name — the panel shows live duplicate warnings if a similar entity already exists.</Step>
          <Step n={3}>Select an entity type (person, place, event, territory, geo_feature, admin_boundary).</Step>
          <Step n={4}>Click <strong>Create</strong>. The new entity opens immediately for further editing.</Step>
          <Tip>The <strong>Suggested connections</strong> section on an entity record surfaces co-rulers and name-similar entities that aren't linked yet — a fast way to discover missing relationships.</Tip>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Data Explorer</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            Click <strong>Data Explorer</strong> in the sidebar to enter self-service export mode.
          </p>
          <Step n={1}><strong>Export tab:</strong> Pick an entity type, check the fields you want, click Preview (100-row sample). Each field shows a completeness bar — green ≥90%, amber 50–90%, red below 50%.</Step>
          <Step n={2}>Click <strong>Download CSV</strong> for a full export (up to 5,000 rows, selected fields only). Geometry is exported as <Code>lon</Code> / <Code>lat</Code> columns.</Step>
          <Step n={3}><strong>Summarize tab:</strong> View entity counts per type as a bar chart. Use the Group by picker to see counts broken down by a categorical field (event_type, place_type, etc.) — exportable as CSV.</Step>
          <Tip>The <strong>Relationships</strong> option in the type picker exports the full relationship graph with denormalized from/to names — useful for network analysis in R or Python.</Tip>
        </Section>

        {/* STORIES */}
        <Section id="stories" title="Stories">
          <p style={{ margin: '0 0 16px', lineHeight: 1.65, fontSize: 14 }}>
            Stories are named narrative containers that bind a theme, time range, and a curated set of entities. They are the publishing unit of this application.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Creating a Story</h3>
          <Step n={1}>In the Admin panel, click <strong>Stories</strong> at the bottom of the sidebar.</Step>
          <Step n={2}>Click <strong>New story</strong> and give it a title.</Step>
          <Step n={3}>Fill in the theme, description, and optional time range (start / end year, negative = BCE).</Step>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Adding Entities to a Story</h3>
          <Step n={1}>With a story open, use the <strong>Add entity</strong> search box to find and add entities.</Step>
          <Step n={2}>Each entity link carries a <strong>Role in story</strong> and optional notes — useful for specifying whether a person is a protagonist, antagonist, witness, etc.</Step>
          <Step n={3}>Entities can be removed from the story without deleting them from the knowledge graph.</Step>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>CSV Bulk Import</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            Import a spreadsheet of entities directly into a story.
          </p>
          <Step n={1}>Click <strong>CSV Import</strong> in the story panel and upload a <Code>.csv</Code> file.</Step>
          <Step n={2}>The importer shows a preview of the first rows. Map CSV columns to entity fields: name (required), entity_type, start year, end year, notes.</Step>
          <Step n={3}>Confirm the mapping and click <strong>Import</strong>. A progress bar tracks each row; the summary shows created, skipped (duplicates), and coerced entity types.</Step>
          <Tip>The importer normalizes entity_type values — "Person", "PERSON", and "person" all resolve correctly. Check the coerced count in the result to see how many were adjusted.</Tip>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Story Timeline View</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            Inside a story, click <strong>Show timeline</strong> to see a proportional bar chart of the story's entities plotted on a shared year axis, sorted by start date.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Exporting a Story</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            Use the <strong>Export</strong> panel in a story to download all linked entities as:
          </p>
          <ul style={{ fontSize: 14, lineHeight: 1.8, margin: '0 0 16px', paddingLeft: 20 }}>
            <li><strong>CSV</strong> — entity fields, role, notes</li>
            <li><strong>GeoJSON</strong> — properties only (geometry null for non-spatial entities)</li>
          </ul>
        </Section>

        {/* DATA REQUESTS */}
        <Section id="data-requests" title="Data Requests (Agentic Sourcing)">
          <p style={{ margin: '0 0 16px', lineHeight: 1.65, fontSize: 14 }}>
            Data Requests let you submit natural-language prompts to an offline sourcing agent that finds entities from the web or its training knowledge, then stages them for your review before anything is committed to the database.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Submitting a Request</h3>
          <Step n={1}>Open a story in the Admin panel and find the <strong>Data Request</strong> section.</Step>
          <Step n={2}>Write a natural-language prompt such as <em>"Find all known rulers of Palenque with their reign dates"</em> or <em>"List major battles of the Late Classic Maya collapse period"</em>.</Step>
          <Step n={3}>Optionally add a URL hint — the agent will fetch and read that page as a source.</Step>
          <Step n={4}>Click <strong>Submit</strong>. The request enters the queue with status <Badge color="#d97706">pending</Badge>.</Step>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Running the Agent</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            The sourcing agent runs as a local Python script. From the project directory:
          </p>
          <Block>{`python3 scripts/source_data.py              # one pending request
python3 scripts/source_data.py --all        # all pending
python3 scripts/source_data.py --id <uuid>  # specific request
python3 scripts/source_data.py --retry-failed  # reset and retry failed
python3 scripts/source_data.py --watch      # watch mode, polls every 30s`}</Block>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            The agent uses Claude + web search when <Code>ANTHROPIC_API_KEY</Code> is set in <Code>.env</Code>. Without a key, it falls back to a local Ollama model.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Reviewing Staged Results</h3>
          <Step n={1}>After the agent runs, the request status changes to <Badge color="#2563eb">review</Badge>. Refresh the Admin panel.</Step>
          <Step n={2}>Click <strong>Review staged data</strong> to open the <strong>Staging Review Panel</strong>.</Step>
          <Step n={3}>Each staged row shows: name, entity type, dates, description, source URL, and a confidence badge: <Badge color="#059669">high</Badge> <Badge color="#d97706">medium</Badge> <Badge color="#dc2626">low</Badge> <Badge color="#7a82a8">model knowledge</Badge></Step>
          <Step n={4}>Click <strong>Edit</strong> to modify a row's fields inline before approving.</Step>
          <Step n={5}>Click <strong>Approve</strong> to commit the row — this creates the entity, extension record, annotation, and story link in one shot. Click <strong>Reject</strong> to discard it.</Step>
          <Step n={6}>After reviewing all rows, click <strong>Mark request done</strong> to close the loop.</Step>
          <Tip>Model knowledge rows are sourced from the LLM's training data — treat them as a starting point. High-confidence rows with a source URL have been verified against live web content.</Tip>
        </Section>

        {/* DATA EXPLORER */}
        <Section id="explorer" title="Data Explorer">
          <p style={{ margin: '0 0 16px', lineHeight: 1.65, fontSize: 14 }}>
            The Data Explorer is a self-service query builder for exporting data to R, Python, or any analysis tool. Access it via the <strong>Data Explorer</strong> button in the Admin entity sidebar.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Export Tab</h3>
          <Step n={1}>Select an entity type from the dropdown (person, event, place, territory, geo_feature, admin_boundary, relationships).</Step>
          <Step n={2}>Check the fields you want in your export. All available fields for that type are listed.</Step>
          <Step n={3}>Click <strong>Preview</strong> to run a 100-row sample. Each field shows a completeness bar based on null rate.</Step>
          <Step n={4}>Click <strong>Download CSV</strong> to export up to 5,000 rows. An amber warning appears if the result was capped.</Step>
          <Tip>Point geometry (places, events) is exported as <Code>lon</Code> / <Code>lat</Code>. Polygon centroids (territories, geo_features, admin_boundaries) are also exported as <Code>lon</Code> / <Code>lat</Code>.</Tip>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Summarize Tab</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            View a database-wide bar chart of entity counts per type. Use the <strong>Group by</strong> picker to break down a specific entity type by a categorical field (event_type, place_type, territory_type, etc.). The resulting count table is downloadable as CSV.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Relationships Export</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>
            Select <strong>Relationships</strong> as the entity type to export the full relationship graph with denormalized from/to entity names, types, relation type, and date range. Useful for building network graphs in R (<Code>igraph</Code>) or Python (<Code>networkx</Code>).
          </p>
        </Section>

        {/* PUBLIC VIEWER */}
        <Section id="viewer" title="Public Story Viewer">
          <p style={{ margin: '0 0 16px', lineHeight: 1.65, fontSize: 14 }}>
            Every story has a public, read-only view that can be shared with anyone — no admin login required.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>Sharing a Story</h3>
          <Step n={1}>Open a story in the Admin panel.</Step>
          <Step n={2}>Click the <strong>↗ View public story page</strong> link. This opens the story at <Code>/#/stories/&lt;story-id&gt;</Code>.</Step>
          <Step n={3}>Copy that URL and share it. Recipients can view the story without any login.</Step>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>What the Viewer Shows</h3>
          <ul style={{ fontSize: 14, lineHeight: 1.8, margin: '0 0 16px', paddingLeft: 20 }}>
            <li>Story header: theme, title, time range, and description</li>
            <li>Entity list sorted by type, with type badge and role in story</li>
          </ul>
          <Tip>The public viewer reads directly from Supabase using the public anon key — no server or auth required. It works as a standalone shareable link from any browser.</Tip>
        </Section>
      </div>
    </div>
  )
}
