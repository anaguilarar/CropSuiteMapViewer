
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
    if (loadId !== currentLoadId) return; // if another request started, stop this one

    removeOldGeoRasterLayers(); // ✅ remove old canvases and layers before adding the new one

    const georaster = await parseGeoraster(arrayBuffer);
    if (loadId !== currentLoadId) return;

    currentRaster = georaster;

    currentLayer = new GeoRasterLayer({
      georaster,
      opacity: 1,
      pixelValuesToColorFn: values => {
        const val = values && values[0];
        if (val === undefined || val === null || isNaN(val)) return null;
        return interpolateColor(val);
      }
    }).addTo(map);

    map.fitBounds(currentLayer.getBounds());
    map.invalidateSize(true);

  } catch (err) {
    console.error('❌ Error loading GeoTIFF:', err);
    alert('Failed to load GeoTIFF: ' + url);
  }
}

function removeOldGeoRasterLayers() {
  if (!map) return;

  console.log('🧹 Forcibly removing old GeoRasterLayer canvases...');

  // 1️⃣ Remove tracked current layer if exists
  if (currentLayer) {
    try {
      // destroy its internal tile container before removing
      if (currentLayer._level && currentLayer._level.el) {
        currentLayer._level.el.remove();
      }
      if (currentLayer._container) {
        currentLayer._container.remove();
      }
      if (currentLayer._tileContainer) {
        currentLayer._tileContainer.remove();
      }

      map.removeLayer(currentLayer);
    } catch (e) {
      console.warn('Error removing currentLayer:', e);
    }
    currentLayer = null;
  }

  // 2️⃣ Also check for any georaster-like layers left in map._layers
  Object.values(map._layers).forEach(layer => {
    try {
      if (layer && (layer._georaster || (layer.options && layer.options.pane === 'georasterPane'))) {
        if (layer._container) layer._container.remove();
        if (layer._tileContainer) layer._tileContainer.remove();
        map.removeLayer(layer);
      }
    } catch (e) {}
  });

  // 3️⃣ Remove all leftover canvases in the map container
  document.querySelectorAll('#map canvas').forEach(c => {
    try { c.remove(); } catch (e) {}
  });

  // 4️⃣ Remove and recreate the georasterPane itself
  const oldPane = map.getPane('georasterPane');
  if (oldPane && oldPane.parentNode) oldPane.parentNode.removeChild(oldPane);

  const newPane = map.createPane('georasterPane');
  newPane.style.zIndex = 450;
  newPane.style.pointerEvents = 'none';

  currentRaster = null;
  map.invalidateSize(true);

  console.log('✅ All raster canvases removed and pane recreated.');
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
document.getElementById('loadBtn').addEventListener('click', () => {
  initializeMap();

  const crop = cropSelect.value.toLowerCase();
  const ssp = sspSelect.value.toLowerCase();
  const period = periodSelect.value.toLowerCase();
  const tifPath = `results/cog/${ssp}_${period.replace('-', '_')}_${crop}_suitability.tif`;

  console.log('🗺️ Loading:', tifPath);

  if (activeMarker) {
    try { map.removeLayer(activeMarker); } catch (e) {}
    activeMarker = null;
  }

  currentLoadId++;
  loadGeoTIFFGuarded(tifPath, currentLoadId);
});

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
