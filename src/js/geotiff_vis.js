
let baseLayer, legend;
let currentRaster = null;
let currentLayer = null;
let activeMarker = null;
let map;


$(function () {
  initializeMap();
});

function debugPanesAndCanvases(tag = '') {
  try {
    console.log('--- DEBUG PANE / CANVAS STATE', tag);
    console.log('window.map._layers count:', Object.keys(window.map._layers).length);
    Object.values(window.map._layers).forEach((l, i) => {
      try {
        console.log(i, l && l.constructor && l.constructor.name, 'pane:', l && l.options && l.options.pane, 'hasGeoraster:', !!(l && l._georaster));
      } catch (e) { }
    });
    ['mapPane', 'tilePane', 'overlayPane', 'shadowPane', 'georasterPane'].forEach(name => {
      const p = window.map.getPane(name);
      console.log('pane', name, 'exists?', !!p, 'children:', p ? p.children.length : 'n/a');
      if (p) Array.from(p.children).forEach((c, i) => console.log('   ', name, i, c.tagName, c.className));
    });
    console.log('#map canvases', document.querySelectorAll('#map canvas').length);
  } catch (e) {
    console.warn('debugPanesAndCanvases error', e);
  }
}

// --- Load and render GeoTIFF ---

function loadGeoTIFFGuarded(url) {
  try {
    // 🧹 Eliminar capa anterior del mapa (si existe)
    if (currentLayer && window.map.hasLayer(currentLayer)) {
      window.map.removeLayer(currentLayer);
      console.log("🧹 Capa anterior eliminada del mapa");
    }
    currentLayer = null;
    currentRaster = null;

    // 🚫 Evitar caché del navegador
    const noCacheUrl = url;

    fetch(noCacheUrl, { cache: "no-store" })
      .then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.arrayBuffer();
      })
      .then(arrayBuffer => {
        console.log("🌍 Cargando GeoTIFF:", noCacheUrl);
        return parseGeoraster(arrayBuffer);
      })
      .then(georaster => {
        currentRaster = georaster;

        // 🧩 Crear nueva capa raster
        currentLayer = new GeoRasterLayer({
          georaster,
          opacity: 1,
          // pixelValuesToColorFn: values => {
          //   const val = values && values[0];
          //   if (val === undefined || val === null || isNaN(val)) return null;
          //   return interpolateColor(val);
          // },
        });

        // ✅ Agregar nueva capa al mapa
        currentLayer.addTo(window.map);
        window.map.fitBounds(currentLayer.getBounds());
        window.map.invalidateSize(true);
        console.log("✅ Nueva capa agregada al mapa:", url);
      })
      .catch(err => {
        console.error("❌ Error loading GeoTIFF:", err);
        alert("Failed to load GeoTIFF: " + url);
      });

  } catch (err) {
    console.error("❌ Unexpected error:", err);
  }
}

// -----
function removeOldGeoRasterLayers() {
  if (!window.map) return;

  console.log('🧹 Removing GeoRasterLayers the safe way...');

  // 1️⃣ Remove tracked layer if exists
  if (currentLayer) {
    window.map.removeLayer(currentLayer);
    currentLayer = null;
  }

  // 2️⃣ Remove any leftover raster layers
  window.map.eachLayer(layer => {
    if (layer._georaster || (layer.options && layer.options.pane === 'georasterPane')) {
      try { window.map.removeLayer(layer); } catch (e) { }
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
  const oldPane = window.map.getPane('georasterPane');
  if (oldPane && oldPane.parentNode) oldPane.parentNode.removeChild(oldPane);
  const newPane = window.map.createPane('georasterPane');
  newPane.style.zIndex = 450;
  newPane.style.pointerEvents = 'none';

  // 5️⃣ Force Leaflet to recompute layout
  window.map.invalidateSize(true);

  currentRaster = null;
  console.log('✅ GeoRaster layers fully cleared.');
}

// --- Function to initialize map (run only once) ---
function initializeMap() {
  console.log("🗺️ initializeMap...");

  // --- Asegurar que 'map' sea global ---
  if (window.map && window.map._layers) {
    try {
      console.log("🧹 Eliminando mapa existente...");
      window.map.off();     // quita todos los listeners
      window.map.remove();  // elimina el mapa del DOM
    } catch (err) {
      console.warn("⚠️ Error al eliminar el mapa anterior:", err);
    }
  }

  // 🔄 Recrear el contenedor del mapa
  document.getElementById("mapxxx").innerHTML = "<div id='map'></div>";

  // --- Crear nuevo mapa ---
  window.map = L.map('map').setView([0, 20], 4);


  window.baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(window.map);

  // --- Color map ---
  const colorMap = [
    { value: 0, color: [215, 212, 213] },
    { value: 20, color: [245, 144, 83] },
    { value: 40, color: [254, 223, 154] },
    { value: 60, color: [219, 240, 158] },
    { value: 80, color: [138, 204, 98] },
    { value: 100, color: [26, 150, 65] }
  ];

  // --- Interpolate colors ---
  window.interpolateColor = function (val) {
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
  // window.getPixelValueAtLatLng = function (lat, lon) {
  //   if (!window.currentRaster) return null;
  //   const { xmin, ymax, pixelWidth, pixelHeight, width, height, values } = currentRaster;
  //   const x = Math.floor((lon - xmin) / pixelWidth);
  //   const y = Math.floor((ymax - lat) / Math.abs(pixelHeight));
  //   if (x < 0 || x >= width || y < 0 || y >= height) return null;
  //   const val = values[0][y][x];
  //   if (val === undefined || val === null || isNaN(val)) return null;
  //   return val;
  // };

  // --- Legend ---
  window.legend = L.control({ position: 'bottomright' });
  // legend.onAdd = function () {
  //   const div = L.DomUtil.create('div', 'info legend');
  //   const gradient = colorMap.map(c => `rgb(${c.color.join(',')}) ${c.value}%`).join(', ');
  //   div.innerHTML = `
  //     <div><b>Suitability (%)</b></div>
  //     <div style="width:150px;height:15px;margin:4px 0;
  //     background:linear-gradient(to right,${gradient});border:1px solid #aaa;"></div>
  //     <div style="display:flex;justify-content:space-between;">
  //       <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
  //     </div>`;
  //   div.style.background = 'white';
  //   div.style.padding = '8px';
  //   div.style.borderRadius = '6px';
  //   div.style.boxShadow = '0 0 6px rgba(0,0,0,0.3)';
  //   div.style.fontSize = '12px';
  //   return div;
  // };
  // legend.addTo(window.map);
}

// Attach UI handlers (assumes your HTML has elements with these IDs)
let isLoading = false;

document.getElementById('loadBtn').addEventListener('click', function () {

  initializeMap();

  // 🔤 Construir ruta GeoTIFF con parámetro anti-caché
  const crop = cropSelect.value.toLowerCase();
  const ssp = sspSelect.value.toLowerCase();
  const period = periodSelect.value.toLowerCase();
  const tifPath = `src/cog/${ssp}_${period.replace('-', '_')}_${crop}_suitability.tif?nocache=${Date.now()}`;

  console.log('🗺️ Loading:', tifPath);

  // 🧹 Limpiar capa anterior y cargar la nueva
  loadGeoTIFFGuarded(tifPath);
});


