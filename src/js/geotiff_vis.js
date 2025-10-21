
let map, baseLayer, legend;
let currentRaster = null;
let currentLayer = null;
let currentLoadId = 0;
let activeMarker = null;

function debugPanesAndCanvases(tag = '') {
  try {
    console.log('--- DEBUG PANE / CANVAS STATE', tag);
    console.log('map._layers count:', Object.keys(map._layers).length);
    Object.values(map._layers).forEach((l, i) => {
      try {
        console.log(i, l && l.constructor && l.constructor.name, 'pane:', l && l.options && l.options.pane, 'hasGeoraster:', !!(l && l._georaster));
      } catch(e){}
    });
    ['mapPane','tilePane','overlayPane','shadowPane','georasterPane'].forEach(name=>{
      const p = map.getPane(name);
      console.log('pane', name, 'exists?', !!p, 'children:', p ? p.children.length : 'n/a');
      if (p) Array.from(p.children).forEach((c,i)=> console.log('   ', name, i, c.tagName, c.className));
    });
    console.log('#map canvases', document.querySelectorAll('#map canvas').length);
  } catch(e) {
    console.warn('debugPanesAndCanvases error', e);
  }
}

// --- Load and render GeoTIFF ---

async function loadGeoTIFFGuarded(url, loadId) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();

    // stop if another load started
    if (loadId !== currentLoadId) return;

    removeOldGeoRasterLayers();

    const georaster = await parseGeoraster(arrayBuffer);
    if (loadId !== currentLoadId) return;

    currentRaster = georaster;

    const thisLoadId = loadId; // snapshot of load ID

    currentLayer = new GeoRasterLayer({
      georaster,
      opacity: 1,
      pixelValuesToColorFn: values => {
        // ✅ Abort rendering if a newer raster started loading
        if (thisLoadId !== currentLoadId) return null;

        const val = values && values[0];
        if (val === undefined || val === null || isNaN(val)) return null;
        return interpolateColor(val);
      },
    });

    // Only add if still valid
    if (loadId === currentLoadId) {
      currentLayer.addTo(map);
      map.fitBounds(currentLayer.getBounds());
      map.invalidateSize(true);
    }
  } catch (err) {
    console.error('❌ Error loading GeoTIFF:', err);
    alert('Failed to load GeoTIFF: ' + url);
  }
}


// -----
function removeOldGeoRasterLayers() {
  if (!map) return;

  console.log('🧹 Removing GeoRasterLayers the safe way...');

  // 1️⃣ Remove tracked layer if exists
  if (currentLayer) {
    map.removeLayer(currentLayer);
    currentLayer = null;
  }

  // 2️⃣ Remove any leftover raster layers
  map.eachLayer(layer => {
    if (layer._georaster || (layer.options && layer.options.pane === 'georasterPane')) {
      try { map.removeLayer(layer); } catch (e) {}
    }
  });

  // 3️⃣ Remove leftover canvases
  const mapEl = document.getElementById('map');
  Array.from(mapEl.querySelectorAll('canvas')).forEach(c => {
    if (c.closest('.leaflet-tile-pane') || c.closest('.leaflet-overlay-pane')) {
      c.remove();
    }
  });

  // 4️⃣ Recreate pane to force a clean redraw
  const oldPane = map.getPane('georasterPane');
  if (oldPane && oldPane.parentNode) oldPane.parentNode.removeChild(oldPane);
  const newPane = map.createPane('georasterPane');
  newPane.style.zIndex = 450;
  newPane.style.pointerEvents = 'none';

  // 5️⃣ Force Leaflet to recompute layout
  map.invalidateSize(true);

  currentRaster = null;
  console.log('✅ GeoRaster layers fully cleared.');
}

// --- Function to initialize map (run only once) ---
function initializeMap() {
  if (map) return; // prevent re-initialization

  map = L.map('map').setView([10, -75], 6);

  baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // --- Color map ---
  const colorMap = [
    { value: 0,   color: [215,212,213] },
    { value: 20,  color: [245,144,83] },
    { value: 40,  color: [254,223,154] },
    { value: 60,  color: [219,240,158] },
    { value: 80,  color: [138,204,98] },
    { value: 100, color: [26,150,65] }
  ];

  // --- Interpolate colors ---
  window.interpolateColor = function(val) {
    val = Math.max(0, Math.min(100, val));
    for (let i = 0; i < colorMap.length - 1; i++) {
      const low = colorMap[i];
      const high = colorMap[i + 1];
      if (val >= low.value && val <= high.value) {
        const t = (val - low.value) / (high.value - low.value);
        const r = Math.round(low.color[0] + t * (high.color[0] - low.color[0]));
        const g = Math.round(low.color[1] + t * (high.color[1] - low.color[1]));
        const b = Math.round(low.color[2] + t * (high.color[2] - low.color[2]));
        const alpha = val < 20 ? 0.02 * val : 1;
        return `rgba(${r},${g},${b},${alpha})`;
      }
    }
    return `rgba(${colorMap[colorMap.length - 1].color.join(",")},1)`;
  };

  // --- Helper to get pixel value ---
  window.getPixelValueAtLatLng = function(lat, lon) {
    if (!currentRaster) return null;
    const { xmin, ymax, pixelWidth, pixelHeight, width, height, values } = currentRaster;
    const x = Math.floor((lon - xmin) / pixelWidth);
    const y = Math.floor((ymax - lat) / Math.abs(pixelHeight));
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    const val = values[0][y][x];
    if (val === undefined || val === null || isNaN(val)) return null;
    return val;
  };

  // --- Click event to show value ---

  // --- Legend ---
  legend = L.control({ position: 'bottomright' });
  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'info legend');
    const gradient = colorMap.map(c => `rgb(${c.color.join(',')}) ${c.value}%`).join(', ');
    div.innerHTML = `
      <div><b>Suitability (%)</b></div>
      <div style="width:150px;height:15px;margin:4px 0;
      background:linear-gradient(to right,${gradient});border:1px solid #aaa;"></div>
      <div style="display:flex;justify-content:space-between;">
        <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
      </div>`;
    div.style.background = 'white';
    div.style.padding = '8px';
    div.style.borderRadius = '6px';
    div.style.boxShadow = '0 0 6px rgba(0,0,0,0.3)';
    div.style.fontSize = '12px';
    return div;
  };
  legend.addTo(map);
}
// Attach UI handlers (assumes your HTML has elements with these IDs)
let isLoading = false;

document.getElementById('loadBtn').addEventListener('click', async () => {
  if (isLoading) {
    console.log('⏳ Please wait: previous raster still loading...');
    return;
  }
  isLoading = true;

  initializeMap();

  const crop = cropSelect.value.toLowerCase();
  const ssp = sspSelect.value.toLowerCase();
  const period = periodSelect.value.toLowerCase();
  const tifPath = `src/cog/${ssp}_${period.replace('-', '_')}_${crop}_suitability.tif`;

  console.log('🗺️ Loading:', tifPath);

  if (activeMarker) {
    try { map.removeLayer(activeMarker); } catch (e) {}
    activeMarker = null;
  }

  currentLoadId++;
  await loadGeoTIFFGuarded(tifPath, currentLoadId);
  isLoading = false;
});

//------
document.getElementById('cleanBtn').addEventListener('click', () => {
  if (!map) return;
  removeOldGeoRasterLayers();
  if (activeMarker) { try { map.removeLayer(activeMarker); } catch (e) {} activeMarker = null; }
  alert('🧹 Everything has been cleaned!');
});

// Run this and paste results
Object.values(map._layers).forEach((l,i)=>console.log(i, l && l.constructor && l.constructor.name, 'pane:', l && l.options && l.options.pane, 'hasGeoraster:', !!(l && l._georaster)));
console.log('pane children counts:');
['mapPane','tilePane','overlayPane','georasterPane'].forEach(name=>{
  const p = map.getPane(name);
  console.log(name, p ? p.children.length : 'no pane');
  if (p) Array.from(p.children).forEach((c,i)=> console.log('  ', name, i, c.tagName, c.className));
});
console.log('#map canvases:', document.querySelectorAll('#map canvas').length);


const observer = new MutationObserver(() => {
  document.querySelectorAll('#map canvas').forEach(c => {
    const pane = c.closest('.leaflet-tile-pane, .leaflet-overlay-pane');
    if (!pane || !pane.closest('#map')) c.remove();
  });
});
observer.observe(document.getElementById('map'), { childList: true, subtree: true });
