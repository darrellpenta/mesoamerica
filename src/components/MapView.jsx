import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { snapFeatureToGeometry, countSnappedVertices } from '../utils/geoSnap'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

// ---------------------------------------------------------------------------
// Projective transform helpers
// ---------------------------------------------------------------------------
function adj3(m) {
  return [
    m[4]*m[8]-m[5]*m[7], m[2]*m[7]-m[1]*m[8], m[1]*m[5]-m[2]*m[4],
    m[5]*m[6]-m[3]*m[8], m[0]*m[8]-m[2]*m[6], m[2]*m[3]-m[0]*m[5],
    m[3]*m[7]-m[4]*m[6], m[1]*m[6]-m[0]*m[7], m[0]*m[4]-m[1]*m[3],
  ]
}
function mul33(a, b) {
  const c = new Array(9).fill(0)
  for (let i=0;i<3;i++) for (let j=0;j<3;j++) for (let k=0;k<3;k++) c[3*i+j]+=a[3*i+k]*b[3*k+j]
  return c
}
function mulv3(m, v) {
  return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]
}
function basisToPoints(x1,y1,x2,y2,x3,y3,x4,y4) {
  const m=[x1,x2,x3,y1,y2,y3,1,1,1], v=mulv3(adj3(m),[x4,y4,1])
  return mul33(m,[v[0],0,0,0,v[1],0,0,0,v[2]])
}
function computeMatrix3d(w, h, corners) {
  const [tl,tr,br,bl]=corners
  const s=basisToPoints(0,0,w,0,w,h,0,h), d=basisToPoints(tl[0],tl[1],tr[0],tr[1],br[0],br[1],bl[0],bl[1])
  const t=mul33(d,adj3(s)), n=t[8]||1
  return `matrix3d(${[t[0]/n,t[3]/n,0,t[6]/n,t[1]/n,t[4]/n,0,t[7]/n,0,0,1,0,t[2]/n,t[5]/n,0,1].join(',')})`
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------
function getAllCoords(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates.flat()
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2)
  if (geometry.type === 'LineString') return geometry.coordinates
  if (geometry.type === 'MultiLineString') return geometry.coordinates.flat()
  if (geometry.type === 'Point') return [geometry.coordinates]
  return []
}

// ---------------------------------------------------------------------------
// Freehand polygon draw mode
// ---------------------------------------------------------------------------
const FreehandPolygonMode = {
  onSetup() {
    const polygon=this.newFeature({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[]]}})
    this.addFeature(polygon)
    this.setActionableState({trash:true,combineFeatures:false,uncombineFeatures:false})
    return {polygon,coordIdx:0,isDown:false,firstCoord:null}
  },
  onMouseDown(state){state.isDown=true},
  onMouseMove(state,e){
    if(!state.isDown)return
    if(state.coordIdx>0){
      const prev=state.polygon.getCoordinate(`0.${state.coordIdx-1}`)
      if(Math.abs(e.lngLat.lng-prev[0])<0.0005&&Math.abs(e.lngLat.lat-prev[1])<0.0005)return
    }
    if(state.coordIdx===0)state.firstCoord=[e.lngLat.lng,e.lngLat.lat]
    state.polygon.updateCoordinate(`0.${state.coordIdx}`,e.lngLat.lng,e.lngLat.lat)
    state.coordIdx++
  },
  onMouseUp(state){
    state.isDown=false
    if(state.coordIdx<3){this.deleteFeature([state.polygon.id]);this.changeMode('simple_select');return}
    if(state.firstCoord)state.polygon.updateCoordinate(`0.${state.coordIdx}`,state.firstCoord[0],state.firstCoord[1])
    this.changeMode('simple_select',{featureIds:[state.polygon.id]})
  },
  toDisplayFeatures(state,geojson,display){display(geojson)},
}

// ---------------------------------------------------------------------------
// Static GeoJSON layer
// ---------------------------------------------------------------------------
function addLayerToMap(map, layer, cbRef) {
  map.addSource(layer.id,{type:'geojson',data:layer.dataUrl})
  if(layer.mapboxType==='circle'){
    const cc=layer.featureColor?['coalesce',['get','color'],layer.color]:layer.color
    map.addLayer({id:layer.id,type:'circle',source:layer.id,layout:{visibility:layer.visible?'visible':'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],4,5,10,9],'circle-color':cc,'circle-stroke-width':1.5,'circle-stroke-color':'#fff','circle-opacity':0.9}})
    map.addLayer({id:`${layer.id}-labels`,type:'symbol',source:layer.id,minzoom:6,layout:{visibility:layer.visible?'visible':'none','text-field':['get','name'],'text-size':['interpolate',['linear'],['zoom'],6,10,12,13],'text-offset':[0,1.2],'text-anchor':'top','text-max-width':8},paint:{'text-color':'#1e2030','text-halo-color':'#fff','text-halo-width':1.5}})
    map.on('click',layer.id,e=>cbRef.current.onFeatureClick?.(e.features[0]))
    map.on('mouseenter',layer.id,()=>{map.getCanvas().style.cursor='pointer'})
    map.on('mouseleave',layer.id,()=>{map.getCanvas().style.cursor=''})
  }
  if(layer.mapboxType==='fill'){
    const fc=layer.featureColor?['coalesce',['get','color'],layer.color]:layer.color
    map.addLayer({id:layer.id,type:'fill',source:layer.id,layout:{visibility:layer.visible?'visible':'none'},paint:{'fill-color':fc,'fill-opacity':0.25}})
    map.addLayer({id:`${layer.id}-outline`,type:'line',source:layer.id,layout:{visibility:layer.visible?'visible':'none'},paint:{'line-color':fc,'line-width':1.5,'line-opacity':0.6}})
    map.addLayer({id:`${layer.id}-labels`,type:'symbol',source:layer.id,minzoom:4,layout:{visibility:layer.visible?'visible':'none','text-field':['get','name'],'text-size':['interpolate',['linear'],['zoom'],4,9,10,13],'text-max-width':10},paint:{'text-color':'#1e2030','text-halo-color':'#fff','text-halo-width':1.5}})
    map.on('click',layer.id,e=>{
      const{regionBuildMode:rm,onCellToggle:oct,onFeatureClick:ofc}=cbRef.current
      if(rm)oct?.(layer.id,e.features[0]);else ofc?.(e.features[0])
    })
    map.on('mouseenter',layer.id,()=>{ if(!cbRef.current.regionBuildMode)return; map.getCanvas().style.cursor='crosshair' })
    map.on('mouseleave',layer.id,()=>{ if(!cbRef.current.regionBuildMode)return; map.getCanvas().style.cursor='crosshair' })
  }
  if(layer.mapboxType==='line'){
    const lc=layer.featureColor?['coalesce',['get','color'],layer.color]:layer.color
    map.addLayer({id:layer.id,type:'line',source:layer.id,layout:{visibility:layer.visible?'visible':'none','line-cap':'round','line-join':'round'},paint:{'line-color':lc,'line-width':layer.lineWidth||1.5,'line-opacity':0.75}})
    map.on('click',layer.id,e=>cbRef.current.onFeatureClick?.(e.features[0]))
    map.on('mouseenter',layer.id,()=>{map.getCanvas().style.cursor='pointer'})
    map.on('mouseleave',layer.id,()=>{map.getCanvas().style.cursor=''})
  }
}

// ---------------------------------------------------------------------------
// User-created layer
// ---------------------------------------------------------------------------
function addUserLayerToMap(map, layer, cbRef) {
  const geojson={type:'FeatureCollection',features:layer.features}
  const before=map.getStyle().layers.find(l=>l.id.startsWith('gl-draw'))?.id
  const vis=layer.visible?'visible':'none', c=layer.color
  map.addSource(layer.id,{type:'geojson',data:geojson})
  map.addLayer({id:`${layer.id}-fill`,type:'fill',source:layer.id,filter:['==',['geometry-type'],'Polygon'],layout:{visibility:vis},paint:{'fill-color':c,'fill-opacity':0.25}},before)
  map.addLayer({id:`${layer.id}-stroke`,type:'line',source:layer.id,filter:['in',['geometry-type'],['literal',['Polygon','LineString']]],layout:{visibility:vis},paint:{'line-color':c,'line-width':2,'line-opacity':0.85}},before)
  map.addLayer({id:`${layer.id}-points`,type:'circle',source:layer.id,filter:['==',['geometry-type'],'Point'],layout:{visibility:vis},paint:{'circle-color':c,'circle-radius':6,'circle-stroke-color':'#fff','circle-stroke-width':1.5}},before)
  map.addLayer({id:`${layer.id}-labels`,type:'symbol',source:layer.id,minzoom:5,layout:{visibility:vis,'text-field':['coalesce',['get','name'],''],'text-size':12,'text-anchor':'top','text-offset':[0,0.8]},paint:{'text-color':'#1e2030','text-halo-color':'#fff','text-halo-width':1.5}},before)
  map.on('click',`${layer.id}-fill`,e=>cbRef.current.onFeatureClick?.(e.features[0]))
  map.on('click',`${layer.id}-stroke`,e=>cbRef.current.onFeatureClick?.(e.features[0]))
  map.on('click',`${layer.id}-points`,e=>cbRef.current.onFeatureClick?.(e.features[0]))
}

// ---------------------------------------------------------------------------
// MapView — exported with forwardRef so App can call imperative methods
// ---------------------------------------------------------------------------
// Region bbox for map-type overlays (Mexico → Costa Rica)
const REGION_BBOX = { w:-118, e:-77, s:8, n:32 }

// Stable IDs for map-type overlay layers/sources
const MT_DEM_SRC       = 'mt-dem'
const MT_CONTOUR_SRC   = 'mt-contour-src'
const MT_POP_SRC       = 'mt-pop-src'
const MT_LAYERS        = ['mt-hillshade','mt-contours','mt-pop-fill','mt-pop-outline','mt-pop-labels']
const MT_SOURCES       = [MT_DEM_SRC, MT_CONTOUR_SRC, MT_POP_SRC]

function removeMapTypeOverlays(map) {
  MT_LAYERS.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id) } catch(_){} })
  try { if (map.getTerrain()) map.setTerrain(null) } catch(_) {}
  MT_SOURCES.forEach(id => { try { if (map.getSource(id)) map.removeSource(id) } catch(_){} })
}

function applyMapType(map, mapType) {
  removeMapTypeOverlays(map)
  // Insert overlays before first data layer so they render beneath everything
  const before = map.getLayer('sites') ? 'sites' : undefined

  if (mapType === 'topographic' || mapType === 'terrain') {
    if (!map.getSource(MT_DEM_SRC)) {
      map.addSource(MT_DEM_SRC, {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512, maxzoom: 14,
      })
    }
    map.addLayer({
      id: 'mt-hillshade', type: 'hillshade', source: MT_DEM_SRC,
      paint: {
        'hillshade-exaggeration': mapType === 'terrain' ? 0.6 : 0.35,
        'hillshade-shadow-color': '#4a3b2a',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': '#a08050',
      },
    }, before)

    if (mapType === 'topographic') {
      map.addSource(MT_CONTOUR_SRC, {
        type: 'vector', url: 'mapbox://mapbox.mapbox-terrain-v2',
      })
      map.addLayer({
        id: 'mt-contours', type: 'line',
        source: MT_CONTOUR_SRC, 'source-layer': 'contour',
        minzoom: 5,
        filter: ['any', ['==', ['%', ['get','ele'], 500], 0], ['==', ['%', ['get','ele'], 100], 0]],
        paint: {
          'line-color': ['interpolate', ['linear'], ['get','ele'],
            0,'#b8a070', 1000,'#806030', 3000,'#605040'],
          'line-width': ['interpolate', ['linear'], ['zoom'],
            5, ['case', ['==', ['%', ['get','ele'], 500], 0], 1.2, 0.4],
            12,['case', ['==', ['%', ['get','ele'], 500], 0], 2,   0.8]],
          'line-opacity': 0.55,
        },
      }, before)
    }

    if (mapType === 'terrain') {
      map.setTerrain({ source: MT_DEM_SRC, exaggeration: 1.8 })
    }
  }

  if (mapType === 'population') {
    map.addSource(MT_POP_SRC, { type: 'geojson', data: './data/population-admin1.geojson' })
    map.addLayer({
      id: 'mt-pop-fill', type: 'fill', source: MT_POP_SRC,
      paint: {
        'fill-color': ['interpolate', ['linear'], ['get','pop_density'],
          0,'#ffffb2', 5,'#fed976', 20,'#feb24c', 50,'#fd8d3c',
          150,'#f03b20', 500,'#bd0026', 2000,'#7a0017'],
        'fill-opacity': 0.72,
      },
    }, before)
    map.addLayer({
      id: 'mt-pop-outline', type: 'line', source: MT_POP_SRC,
      paint: { 'line-color': '#ffffff', 'line-width': 0.5, 'line-opacity': 0.4 },
    }, before)
    map.addLayer({
      id: 'mt-pop-labels', type: 'symbol', source: MT_POP_SRC,
      minzoom: 5,
      layout: {
        'text-field': ['concat', ['get','name'], '\n', ['number-format', ['get','pop_density'], {'max-fraction-digits':0}], '/km²'],
        'text-size': 10, 'text-anchor': 'center', 'text-max-width': 8,
      },
      paint: { 'text-color': '#1a1a1a', 'text-halo-color': '#ffffffcc', 'text-halo-width': 1.2 },
    })
  }
}

const MapView = forwardRef(function MapView({
  layers, userLayers, helperLayers=[], activeTool, snapConfig=null,
  mapType='default',
  pendingReEdit=null, regionBuildMode=false, selectedCells=[],
  onFeatureClick, onFeatureDrawn, onAttachHelper, onCellToggle, onMapClick,
}, ref) {
  const containerRef         = useRef(null)
  const mapRef               = useRef(null)
  const drawRef              = useRef(null)
  const renderedUserLayerIds = useRef(new Set())
  const renderedHelperIds    = useRef(new Set())
  const iaRef                = useRef(null)
  // callbacksRef: always-current props, safe to use inside Mapbox closures
  const callbacksRef         = useRef({})
  callbacksRef.current = { onFeatureClick, onFeatureDrawn, snapConfig, onAttachHelper, regionBuildMode, onCellToggle, onMapClick, layers, pendingReEdit: !!pendingReEdit }

  const [overlay, setOverlay]       = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [snapStatus, setSnapStatus] = useState(null) // { count } after snap applied
  const [vertexMenu, setVertexMenu] = useState(null) // { x, y, vertexInfo, edgeInfo, feat }
  const vertexMenuRef               = useRef(null)   // mirror for reading inside event closures
  const overlayAttachedRef          = useRef(false)  // true when setOverlay(null) comes from Attach (not Discard)
  const overlayPreviewIdRef         = useRef(null)   // _id of the current live-preview source

  // ── Expose imperative API ──────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getReEditFeature: (featureId) => {
      const features = drawRef.current?.getAll()?.features ?? []
      // Fall back to features[0] — during re-edit only one feature is in Draw
      return features.find(f => f.id === featureId) ?? features[0] ?? null
    },
    fitToFeature: (feature) => {
      const map = mapRef.current
      if (!map || !feature?.geometry) return
      const coords = getAllCoords(feature.geometry)
      if (!coords.length) return
      const lngs = coords.map(c => c[0])
      const lats = coords.map(c => c[1])
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 80, maxZoom: 12, duration: 700 }
      )
    },
    syncLayerOrder: (orderedLayers) => {
      const map = mapRef.current
      if (!map) return
      const anchor = map.getLayer('region-selection-fill') ? 'region-selection-fill' : undefined
      // Process bottom-to-top so the first item in the array ends up lowest in the stack
      const reversed = [...orderedLayers].reverse()
      for (const layer of reversed) {
        const sfxList = layer.mapboxType === 'fill' ? ['', '-outline', '-labels']
                      : layer.mapboxType === 'line' ? ['']
                      : ['', '-labels']
        for (const sfx of sfxList) {
          try { if (map.getLayer(`${layer.id}${sfx}`)) map.moveLayer(`${layer.id}${sfx}`, anchor) } catch(_) {}
        }
      }
    },
  }))

  // ── Map init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = new mapboxgl.Map({
      container:containerRef.current,
      style:'mapbox://styles/mapbox/light-v11',
      center:[-88,18], zoom:5, minZoom:3, maxZoom:18,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl(),'top-right')
    map.addControl(new mapboxgl.ScaleControl({unit:'metric'}),'bottom-right')
    const draw = new MapboxDraw({
      displayControlsDefault:false,
      modes:{...MapboxDraw.modes, freehand_polygon:FreehandPolygonMode},
    })
    drawRef.current = draw

    map.on('load',()=>{
      layers.forEach(layer=>{ if(layer.dataUrl&&!layer.disabled) addLayerToMap(map,layer,callbacksRef) })
      map.addControl(draw)

      // Region-builder selection highlight — on top of all other layers
      map.addSource('region-selection',{type:'geojson',data:{type:'FeatureCollection',features:[]}})
      map.addLayer({id:'region-selection-fill',type:'fill',source:'region-selection',paint:{'fill-color':'#f4a46a','fill-opacity':0.48}})
      map.addLayer({id:'region-selection-outline',type:'line',source:'region-selection',paint:{'line-color':'#e85d04','line-width':2.5}})

      // General click — query all visible data layers to power "what's here"
      map.on('click', e => {
        const { onMapClick: omc, layers: currentLayers, regionBuildMode: rm, pendingReEdit: re } = callbacksRef.current
        if (!omc || rm || re) return
        const visIds = (currentLayers || [])
          .filter(l => l.visible && !l.disabled && l.dataUrl)
          .map(l => l.id)
          .filter(id => map.getLayer(id))
        const features = visIds.length ? map.queryRenderedFeatures(e.point, { layers: visIds }) : []
        omc(features, e.lngLat)
      })

      map.on('draw.create', e => {
        const f = e.features[0]
        draw.delete(f.id)
        // Apply boundary snapping if configured
        const { snapConfig: sc, onFeatureDrawn: cb } = callbacksRef.current
        if (sc?.geojson) {
          const snapped = snapFeatureToGeometry(f, sc.geojson, sc.threshold)
          const count = countSnappedVertices(f, snapped)
          if (count > 0) setSnapStatus({ count })
          cb?.(snapped)
        } else {
          cb?.(f)
        }
      })
    })

    // Image drag-and-drop
    const el = containerRef.current
    const onDragOver = e => { e.preventDefault(); e.dataTransfer.dropEffect='copy' }
    const onDrop = e => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if(!file||!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = evt => {
        const src=evt.target.result
        const img=new Image()
        img.onload=()=>{
          const cw=el.clientWidth, ch=el.clientHeight
          const ar=img.naturalWidth/img.naturalHeight
          const w=Math.min(cw*0.65,ch*0.65*ar), h=w/ar
          const x=(cw-w)/2, y=(ch-h)/2
          setOverlay({src,width:w,height:h,opacity:0.6,corners:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],pinnedCorners:[false,false,false,false],_id:`overlayp-${Date.now()}`})
        }
        img.src=src
      }
      reader.readAsDataURL(file)
    }
    el.addEventListener('dragover',onDragOver)
    el.addEventListener('drop',onDrop)
    return ()=>{ el.removeEventListener('dragover',onDragOver); el.removeEventListener('drop',onDrop); map.remove() }
  }, [])

  // ── Global overlay mouse handlers ─────────────────────────────────────────
  useEffect(()=>{
    const onMouseMove = e => {
      const ia=iaRef.current
      if(!ia) return
      e.preventDefault()
      const rect=containerRef.current?.getBoundingClientRect()
      if(!rect) return
      const mx=e.clientX-rect.left, my=e.clientY-rect.top
      if(ia.type==='move'){
        const dx=mx-ia.startMX, dy=my-ia.startMY
        setOverlay(prev=>prev&&({...prev,corners:ia.startCorners.map((c,i)=>ia.pinnedCorners[i]?c:[c[0]+dx,c[1]+dy])}))
      }
      if(ia.type==='rotate'){
        const angle=Math.atan2(my-ia.cy,mx-ia.cx), delta=angle-ia.startAngle
        setOverlay(prev=>prev&&({...prev,corners:ia.startCorners.map((c,i)=>{
          if(ia.pinnedCorners[i])return c
          const dx=c[0]-ia.cx, dy=c[1]-ia.cy
          return[ia.cx+dx*Math.cos(delta)-dy*Math.sin(delta),ia.cy+dx*Math.sin(delta)+dy*Math.cos(delta)]
        })}))
      }
      if(ia.type==='scale'){
        const dist=Math.hypot(mx-ia.cx,my-ia.cy), ratio=Math.max(0.05,dist/ia.startDist)
        setOverlay(prev=>prev&&({...prev,corners:ia.startCorners.map((c,i)=>ia.pinnedCorners[i]?c:[ia.cx+(c[0]-ia.cx)*ratio,ia.cy+(c[1]-ia.cy)*ratio])}))
      }
      if(ia.type==='corner'){
        setOverlay(prev=>{if(!prev)return prev;const nc=prev.corners.map(c=>[...c]);nc[ia.idx]=[mx,my];return{...prev,corners:nc}})
      }
      if(ia.type==='edge'){
        const dx=mx-ia.startMX, dy=my-ia.startMY
        setOverlay(prev=>{if(!prev)return prev;const nc=prev.corners.map(c=>[...c]);ia.idxs.forEach(i=>{nc[i]=[ia.startCorners[i][0]+dx,ia.startCorners[i][1]+dy]});return{...prev,corners:nc}})
      }
    }
    const onMouseUp=()=>{if(iaRef.current){iaRef.current=null;setIsDragging(false)}}
    document.addEventListener('mousemove',onMouseMove)
    document.addEventListener('mouseup',onMouseUp)
    return()=>{document.removeEventListener('mousemove',onMouseMove);document.removeEventListener('mouseup',onMouseUp)}
  },[])

  // ── Draw tool / dragPan ───────────────────────────────────────────────────
  useEffect(()=>{
    const map=mapRef.current, draw=drawRef.current
    if(!map||!draw) return
    activeTool==='freehand_polygon'?map.dragPan.disable():map.dragPan.enable()
    const sync=()=>{try{draw.changeMode(activeTool)}catch(_){}}
    if(map.isStyleLoaded())sync();else map.once('load',sync)
  },[activeTool])

  // ── Re-edit: add feature to Draw when pendingReEdit changes ───────────────
  useEffect(()=>{
    const map=mapRef.current, draw=drawRef.current
    if(!map||!draw||!map.isStyleLoaded()) return
    if(pendingReEdit){
      try{draw.delete(pendingReEdit.id)}catch(_){}
      // draw.add() returns the actual IDs used (generates one if feature.id is missing)
      const addedIds=draw.add(pendingReEdit)
      const eid=addedIds?.[0]??pendingReEdit.id
      try{draw.changeMode('direct_select',{featureId:eid})}catch(_){}
    }
    return () => {
      if(pendingReEdit && draw){
        try{draw.delete(pendingReEdit.id)}catch(_){}
        try{draw.changeMode('simple_select')}catch(_){}
      }
    }
  },[pendingReEdit])

  // ── Region build: sync selected cells to highlight source ─────────────────
  useEffect(()=>{
    const map=mapRef.current
    if(!map) return
    const sync=()=>{
      const src=map.getSource('region-selection')
      if(!src) return
      src.setData({type:'FeatureCollection',features:selectedCells.map(c=>c.feature)})
    }
    if(map.isStyleLoaded())sync();else map.once('load',sync)
  },[selectedCells])

  // ── Region build: cursor ─────────────────────────────────────────────────
  useEffect(()=>{
    const map=mapRef.current
    if(!map) return
    map.getCanvas().style.cursor=regionBuildMode?'crosshair':''
  },[regionBuildMode])

  // ── Re-edit: click polygon → show point-action menu ─────────────────────
  useEffect(() => {
    const map = mapRef.current, draw = drawRef.current
    if (!map || !draw || !pendingReEdit) return

    const VPX = 14, EPX = 14
    const dpx = (ax,ay,bx,by) => Math.hypot(ax-bx,ay-by)
    const toPx = c => { const p=map.project(c); return [p.x,p.y] }
    const nearSeg = (cp,ap,bp) => {
      const dx=bp[0]-ap[0],dy=bp[1]-ap[1],l2=dx*dx+dy*dy
      if(!l2) return {near:ap,dist:dpx(cp[0],cp[1],ap[0],ap[1])}
      const t=Math.max(0,Math.min(1,((cp[0]-ap[0])*dx+(cp[1]-ap[1])*dy)/l2))
      const near=[ap[0]+t*dx,ap[1]+t*dy]; return {near,dist:dpx(near[0],near[1],cp[0],cp[1])}
    }
    const nearestVertex = (cp,rings) => {
      let b=null,bd=Infinity
      rings.forEach((ring,ri)=>ring.slice(0,-1).forEach((c,ci)=>{
        const d=dpx(...toPx(c),cp[0],cp[1]); if(d<bd){bd=d;b={ri,ci,dist:d}}
      })); return b
    }
    const nearestEdge = (cp,rings) => {
      let b=null,bd=Infinity
      rings.forEach((ring,ri)=>{
        for(let i=0;i<ring.length-1;i++){
          const {near,dist}=nearSeg(cp,toPx(ring[i]),toPx(ring[i+1]))
          if(dist<bd){bd=dist;b={ri,si:i,near,dist}}
        }
      }); return b
    }

    const handleClick = e => {
      const feat = draw.getAll().features.find(f => f.id === pendingReEdit.id)
      if (!feat || feat.geometry.type !== 'Polygon') return
      const cp=[e.point.x,e.point.y], rings=feat.geometry.coordinates
      const nv=nearestVertex(cp,rings), ne=nearestEdge(cp,rings)
      const onVertex=nv&&nv.dist<VPX
      const onEdge=ne&&ne.dist<EPX&&!onVertex
      if (!onVertex && !onEdge) return
      const menu={x:e.point.x+10,y:e.point.y+10,vertexInfo:onVertex?nv:null,edgeInfo:onEdge?ne:null,feat}
      setVertexMenu(menu); vertexMenuRef.current=menu
    }
    const handleContextMenu = e => e.originalEvent.preventDefault()

    map.on('click', handleClick)
    map.on('contextmenu', handleContextMenu)
    return () => {
      map.off('click', handleClick)
      map.off('contextmenu', handleContextMenu)
      setVertexMenu(null); vertexMenuRef.current=null
    }
  }, [pendingReEdit])

  // ── Re-edit: menu actions ─────────────────────────────────────────────────
  const doAddPoint = () => {
    const map=mapRef.current, draw=drawRef.current
    if (!map||!draw||!vertexMenu?.edgeInfo) return
    const {edgeInfo,feat}=vertexMenu
    const geo=map.unproject(edgeInfo.near), pt=[geo.lng,geo.lat]
    const newRings=feat.geometry.coordinates.map((ring,ri)=>{
      if(ri!==edgeInfo.ri) return ring
      const r=[...ring]; r.splice(edgeInfo.si+1,0,pt); return r
    })
    const nf={...feat,geometry:{...feat.geometry,coordinates:newRings}}
    draw.add(nf); draw.changeMode('direct_select',{featureId:nf.id})
    setVertexMenu(null); vertexMenuRef.current=null
  }

  const doRemovePoint = () => {
    const draw=drawRef.current
    if (!draw||!vertexMenu?.vertexInfo) return
    const {vertexInfo,feat}=vertexMenu
    const removeFromRing=(ring,ci)=>{
      const u=ring.slice(0,-1).filter((_,i)=>i!==ci)
      return u.length<3?null:[...u,u[0]]
    }
    const newRings=feat.geometry.coordinates.map((ring,ri)=>
      ri===vertexInfo.ri?removeFromRing(ring,vertexInfo.ci):ring
    ).filter(Boolean)
    if (!newRings.length) return
    const nf={...feat,geometry:{...feat.geometry,coordinates:newRings}}
    draw.add(nf); draw.changeMode('direct_select',{featureId:nf.id})
    setVertexMenu(null); vertexMenuRef.current=null
  }

  const closeVertexMenu = () => { setVertexMenu(null); vertexMenuRef.current=null }

  // ── Map type overlays (topographic / terrain / population) ───────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.isStyleLoaded()) {
      applyMapType(map, mapType)
    } else {
      // Style not yet loaded — apply once it finishes
      const onLoad = () => applyMapType(map, mapType)
      map.once('styledata', onLoad)
      return () => map.off('styledata', onLoad)
    }
  }, [mapType])

  // ── Static layer visibility ───────────────────────────────────────────────
  useEffect(()=>{
    const map=mapRef.current
    if(!map) return
    const sync=()=>{
      layers.forEach(layer=>{
        const vis=layer.visible?'visible':'none'
        const sfxList=layer.mapboxType==='line'?['']: ['','-outline','-labels']
        for(const sfx of sfxList){
          const id=`${layer.id}${sfx}`
          if(map.getLayer(id))map.setLayoutProperty(id,'visibility',vis)
        }
      })
    }
    if(map.isStyleLoaded())sync();else map.once('load',sync)
  },[layers])

  // ── User layer sync ───────────────────────────────────────────────────────
  useEffect(()=>{
    const map=mapRef.current
    if(!map) return
    const sync=()=>{
      const currentIds=new Set(userLayers.map(l=>l.id))
      renderedUserLayerIds.current.forEach(id=>{
        if(!currentIds.has(id)){
          for(const sfx of['-fill','-stroke','-points','-labels'])if(map.getLayer(`${id}${sfx}`))map.removeLayer(`${id}${sfx}`)
          if(map.getSource(id))map.removeSource(id)
          renderedUserLayerIds.current.delete(id)
        }
      })
      userLayers.forEach(layer=>{
        const geojson={type:'FeatureCollection',features:layer.features},vis=layer.visible?'visible':'none'
        if(renderedUserLayerIds.current.has(layer.id)){
          map.getSource(layer.id)?.setData(geojson)
          for(const sfx of['-fill','-stroke','-points','-labels'])if(map.getLayer(`${layer.id}${sfx}`))map.setLayoutProperty(`${layer.id}${sfx}`,'visibility',vis)
        }else{
          addUserLayerToMap(map,layer,callbacksRef)
          renderedUserLayerIds.current.add(layer.id)
        }
      })
    }
    if(map.isStyleLoaded())sync();else map.once('load',sync)
  },[userLayers])

  // ── Helper (attached) image layer sync ───────────────────────────────────
  useEffect(()=>{
    const map=mapRef.current
    if(!map) return
    const sync=()=>{
      const currentIds=new Set(helperLayers.map(l=>l.id))
      renderedHelperIds.current.forEach(id=>{
        if(!currentIds.has(id)){
          if(map.getLayer(id))map.removeLayer(id)
          if(map.getSource(id))map.removeSource(id)
          renderedHelperIds.current.delete(id)
        }
      })
      helperLayers.forEach(hl=>{
        if(!renderedHelperIds.current.has(hl.id)){
          const before=map.getStyle().layers.find(l=>l.id.startsWith('user-')||l.id.startsWith('gl-draw'))?.id
          map.addSource(hl.id,{type:'image',url:hl.src,coordinates:hl.geoCorners})
          map.addLayer({id:hl.id,type:'raster',source:hl.id,paint:{'raster-opacity':hl.visible?hl.opacity:0}},before)
          renderedHelperIds.current.add(hl.id)
        }else{
          if(map.getLayer(hl.id))map.setPaintProperty(hl.id,'raster-opacity',hl.visible?hl.opacity:0)
        }
      })
    }
    if(map.isStyleLoaded())sync();else map.once('load',sync)
  },[helperLayers])

  // ── Overlay: live-preview raster in Mapbox (keeps texture warm for zero-jump attach) ──
  useEffect(()=>{
    const map=mapRef.current
    if(!map||!map.isStyleLoaded()) return

    if(!overlay){
      if(!overlayAttachedRef.current){
        // Discarded — clean up the preview source/layer
        const staleId=overlayPreviewIdRef.current
        if(staleId){
          if(map.getLayer(staleId))map.removeLayer(staleId)
          if(map.getSource(staleId))map.removeSource(staleId)
          overlayPreviewIdRef.current=null
        }
      }
      overlayAttachedRef.current=false
      return
    }

    const id=overlay._id
    overlayPreviewIdRef.current=id
    const geoCorners=overlay.corners.map(c=>{const ll=map.unproject(c);return[ll.lng,ll.lat]})

    if(map.getSource(id)){
      map.getSource(id).setCoordinates(geoCorners)
    }else{
      map.addSource(id,{type:'image',url:overlay.src,coordinates:geoCorners})
      // opacity 0: invisible so no double-image during positioning, but texture decodes now
      map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':0}})
    }
  },[overlay])

  // ── Overlay interaction ───────────────────────────────────────────────────
  const startIa = ia => { iaRef.current=ia; setIsDragging(true) }

  const handleBodyMouseDown = e => {
    if(e.target.dataset.handle) return
    e.stopPropagation(); e.preventDefault()
    const rect=containerRef.current.getBoundingClientRect()
    startIa({type:'move',startMX:e.clientX-rect.left,startMY:e.clientY-rect.top,startCorners:overlay.corners.map(c=>[...c]),pinnedCorners:[...overlay.pinnedCorners]})
  }
  const handleRotateMouseDown = e => {
    e.stopPropagation(); e.preventDefault()
    const rect=containerRef.current.getBoundingClientRect()
    const mx=e.clientX-rect.left, my=e.clientY-rect.top
    const cx=overlay.corners.reduce((s,c)=>s+c[0],0)/4, cy=overlay.corners.reduce((s,c)=>s+c[1],0)/4
    startIa({type:'rotate',cx,cy,startAngle:Math.atan2(my-cy,mx-cx),startCorners:overlay.corners.map(c=>[...c]),pinnedCorners:[...overlay.pinnedCorners]})
  }
  const handleScaleMouseDown = e => {
    e.stopPropagation(); e.preventDefault()
    const rect=containerRef.current.getBoundingClientRect()
    const mx=e.clientX-rect.left, my=e.clientY-rect.top
    const cx=overlay.corners.reduce((s,c)=>s+c[0],0)/4, cy=overlay.corners.reduce((s,c)=>s+c[1],0)/4
    startIa({type:'scale',cx,cy,startDist:Math.hypot(mx-cx,my-cy)||1,startCorners:overlay.corners.map(c=>[...c]),pinnedCorners:[...overlay.pinnedCorners]})
  }
  const handleCornerMouseDown = (e, idx) => {
    e.stopPropagation(); e.preventDefault()
    if(e.shiftKey){ setOverlay(prev=>({...prev,pinnedCorners:prev.pinnedCorners.map((p,i)=>i===idx?!p:p)})); return }
    startIa({type:'corner',idx})
  }
  const handleEdgeMouseDown = (e, idxs) => {
    e.stopPropagation(); e.preventDefault()
    const rect=containerRef.current.getBoundingClientRect()
    startIa({type:'edge',idxs,startMX:e.clientX-rect.left,startMY:e.clientY-rect.top,startCorners:overlay.corners.map(c=>[...c])})
  }
  const handleAttach = () => {
    const map=mapRef.current
    if(!map||!overlay) return
    const id=overlay._id
    const geoCorners=overlay.corners.map(c=>{const ll=map.unproject(c);return[ll.lng,ll.lat]})

    // The live-preview source has been tracking the image and pre-warming the texture.
    // Just do a final coord sync and make it visible — zero new source creation, zero texture load.
    if(map.getSource(id)){
      map.getSource(id).setCoordinates(geoCorners)
      map.setPaintProperty(id,'raster-opacity',overlay.opacity)
    }

    // Claim as permanent helper so helperLayers effect doesn't orphan or duplicate it
    renderedHelperIds.current.add(id)
    overlayAttachedRef.current=true
    callbacksRef.current.onAttachHelper?.({id,src:overlay.src,opacity:overlay.opacity,geoCorners})
    setOverlay(null) // CSS overlay removed; Mapbox raster already visible at the same position
  }

  // ── Derived overlay geometry ──────────────────────────────────────────────
  let matrix3dStr=null, rotHandleX=0, rotHandleY=0, scaleHandleX=0, scaleHandleY=0, topMidX=0, topMidY=0
  if(overlay){
    matrix3dStr = computeMatrix3d(overlay.width, overlay.height, overlay.corners)
    topMidX=(overlay.corners[0][0]+overlay.corners[1][0])/2
    topMidY=(overlay.corners[0][1]+overlay.corners[1][1])/2
    const ea=Math.atan2(overlay.corners[1][1]-overlay.corners[0][1],overlay.corners[1][0]-overlay.corners[0][0])
    const pa=ea-Math.PI/2
    rotHandleX=topMidX+Math.cos(pa)*40; rotHandleY=topMidY+Math.sin(pa)*40
    const da=Math.atan2(overlay.corners[2][1]-overlay.corners[0][1],overlay.corners[2][0]-overlay.corners[0][0])
    scaleHandleX=overlay.corners[2][0]+Math.cos(da)*22; scaleHandleY=overlay.corners[2][1]+Math.sin(da)*22
  }

  const CORNER_DEFS=[{idx:0,cursor:'nw-resize',pos:{top:-7,left:-7}},{idx:1,cursor:'ne-resize',pos:{top:-7,right:-7}},{idx:2,cursor:'se-resize',pos:{bottom:-7,right:-7}},{idx:3,cursor:'sw-resize',pos:{bottom:-7,left:-7}}]
  const EDGE_DEFS=[{idxs:[0,1],cursor:'n-resize',pos:{top:-6,left:'50%',transform:'translateX(-50%)'}},{idxs:[1,2],cursor:'e-resize',pos:{right:-6,top:'50%',transform:'translateY(-50%)'}},{idxs:[2,3],cursor:'s-resize',pos:{bottom:-6,left:'50%',transform:'translateX(-50%)'}},{idxs:[3,0],cursor:'w-resize',pos:{left:-6,top:'50%',transform:'translateY(-50%)'}}]

  return (
    <div style={{position:'relative',width:'100%',height:'100%'}}>
      <div ref={containerRef} style={{width:'100%',height:'100%'}} />

      {/* Snap notification */}
      {snapStatus && (
        <div className="snap-notification" onAnimationEnd={()=>setSnapStatus(null)}>
          ⊕ {snapStatus.count} vertex{snapStatus.count!==1?'es':''} snapped to boundary
        </div>
      )}

      {overlay && (
        <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:5}}>
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible',pointerEvents:'none'}}>
            <polygon points={overlay.corners.map(c=>c.join(',')).join(' ')} fill="none" stroke="rgba(232,93,4,0.55)" strokeWidth="1.5" strokeDasharray="6,4"/>
            <line x1={topMidX} y1={topMidY} x2={rotHandleX} y2={rotHandleY} stroke="rgba(0,119,182,0.45)" strokeWidth="1.5"/>
          </svg>

          {/* Warped image */}
          <div
            style={{position:'absolute',left:0,top:0,width:overlay.width,height:overlay.height,transform:matrix3dStr,transformOrigin:'0 0',cursor:isDragging?'grabbing':'grab',pointerEvents:'all',userSelect:'none'}}
            onMouseDown={handleBodyMouseDown}
          >
            <img src={overlay.src} style={{width:'100%',height:'100%',opacity:overlay.opacity,display:'block'}} draggable={false} onDragStart={e=>e.preventDefault()}/>
            {CORNER_DEFS.map(({idx,cursor,pos})=>(
              <div key={idx} data-handle="corner" className="img-corner-handle"
                style={{position:'absolute',cursor,background:overlay.pinnedCorners[idx]?'#e85d04':'#fff',borderColor:overlay.pinnedCorners[idx]?'#e85d04':'#0077b6',...pos}}
                title="Drag to warp • Shift+click to pin/unpin"
                onMouseDown={e=>handleCornerMouseDown(e,idx)}/>
            ))}
            {EDGE_DEFS.map(({idxs,cursor,pos})=>(
              <div key={idxs.join('-')} data-handle="edge" className="img-edge-handle"
                style={{position:'absolute',cursor,...pos}} title="Drag edge"
                onMouseDown={e=>handleEdgeMouseDown(e,idxs)}/>
            ))}
          </div>

          {/* Rotate handle */}
          <div style={{position:'absolute',left:rotHandleX-8,top:rotHandleY-8,width:16,height:16,borderRadius:'50%',background:'#fff',border:'2.5px solid #f4a46a',cursor:'crosshair',pointerEvents:'all',boxShadow:'0 1px 5px rgba(0,0,0,0.4)'}} title="Drag to rotate" onMouseDown={handleRotateMouseDown}/>
          {/* Scale handle */}
          <div style={{position:'absolute',left:scaleHandleX-8,top:scaleHandleY-8,width:16,height:16,borderRadius:3,background:'#0077b6',cursor:'se-resize',pointerEvents:'all',boxShadow:'0 1px 4px rgba(0,0,0,0.35)'}} title="Drag to scale" onMouseDown={handleScaleMouseDown}/>
        </div>
      )}

      {overlay && (
        <div className="overlay-controls">
          <span className="overlay-controls__label">Guide image</span>
          <span className="overlay-controls__hint">Drag • <span style={{color:'#f4a46a'}}>○</span> Rotate • <span style={{color:'#4db6f5'}}>◼</span> Scale • corners skew • Shift+click to pin</span>
          <input type="range" min="0.05" max="1" step="0.05" value={overlay.opacity}
            onChange={e=>setOverlay(prev=>prev&&({...prev,opacity:parseFloat(e.target.value)}))}
            title={`Opacity: ${Math.round(overlay.opacity*100)}%`} style={{width:72}}/>
          <button className="overlay-controls__btn overlay-controls__btn--attach" onClick={handleAttach} title="Lock to map coordinates">Attach to map</button>
          <button className="overlay-controls__remove" onClick={()=>{
            // overlayAttachedRef.current stays false → useEffect will remove the preview source
            setOverlay(null)
          }}>Discard</button>
        </div>
      )}

      {/* Vertex context menu — shown when clicking polygon edge/vertex in re-edit mode */}
      {vertexMenu && (
        <>
          <div className="vertex-menu-overlay" onClick={closeVertexMenu} />
          <div className="vertex-menu" style={{left:vertexMenu.x, top:vertexMenu.y}}>
            <button
              className="vertex-menu__item"
              disabled={!vertexMenu.edgeInfo}
              onClick={doAddPoint}
              title={vertexMenu.edgeInfo ? 'Insert a new vertex on this edge' : 'Click near a polygon edge to add a point'}
            >+ Add point</button>
            <button
              className="vertex-menu__item"
              disabled={!vertexMenu.vertexInfo}
              onClick={doRemovePoint}
              title={vertexMenu.vertexInfo ? 'Delete this vertex' : 'Click near a vertex to remove it'}
            >− Remove point</button>
            <button
              className="vertex-menu__item"
              disabled={!vertexMenu.vertexInfo}
              onClick={closeVertexMenu}
              title={vertexMenu.vertexInfo ? 'Close menu — drag the vertex on the map' : 'Click near a vertex to drag it'}
            >↔ Drag point</button>
          </div>
        </>
      )}
    </div>
  )
})

export default MapView
