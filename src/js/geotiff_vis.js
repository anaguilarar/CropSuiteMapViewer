let map;
let map2;
let map3;
let currentLayer = null;
let layer1 = null;
let layer2 = null;
let layer3 = null;

let legend = null; // ✅ define legend globally
let legend1 = null;
let legend2 = null;
let legend3 = null;

const SuitcolorMap = [
  { value: 0, color: [215, 212, 213] },
  { value: 20, color: [245, 144, 83] },
  { value: 40, color: [254, 223, 154] },
  { value: 60, color: [219, 240, 158] },
  { value: 80, color: [138, 204, 98] },
  { value: 100, color: [26, 150, 65] }
];

const DiffcolorMap = [
  //rgb(255,255,255)
  { value: 0,  color: [255, 255, 255] },   // pure white
  { value: 1,  color: [235, 240, 255] },   // very pale blue
  { value: 10, color: [180, 205, 255] },   // soft light blue
  { value: 20, color: [120, 165, 235] },   // light–medium blue
  { value: 30, color: [80, 120, 210] },    // deeper blue
  { value: 40, color: [60, 85, 170] },     // strong blue-indigo
  { value: 50, color: [55, 50, 150] },     // indigo
  { value: 60, color: [95, 30, 140] }      // purple (smooth transition)

];
// --- Interpolate color ---
function interpolateColor(val, is_diff) {
  var colorMap;
  if(is_diff){
    colorMap = SuitcolorMap
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
  }
  else{
    colorMap = DiffcolorMap

    val = Math.max(0, Math.min(100, val));
    for (let i = 0; i < colorMap.length - 1; i++) {
      const low = colorMap[i];
      const high = colorMap[i + 1];
      if (val >= low.value && val <= high.value) {
        const t = (val - low.value) / (high.value - low.value);
        const r = Math.round(low.color[0] + t * (high.color[0] - low.color[0]));
        const g = Math.round(low.color[1] + t * (high.color[1] - low.color[1]));
        const b = Math.round(low.color[2] + t * (high.color[2] - low.color[2]));
        //const alpha = val < 1 ? 0.02 * val : 1;
        alpha = 1;
        return `rgba(${r},${g},${b})`;

      }
    }

    
  }
  
  return `rgba(${colorMap[colorMap.length - 1].color.join(",")},1)`;
}

async function checkFileExists(url) {
  try {
    const resp = await fetch(url, { method: "HEAD" });
    return resp.ok;
  } catch {
    return false;
  }
}

// Colorize grayscale PNG and hide -1 (value 0)
async function colorizePNG(url, is_suit) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i]; // grayscale 0–255

    // Treat "no data" (0) as transparent
    if (gray === 0) {
      data[i + 3] = 0;
      continue;
    }

    const val = (gray / 255) * 100;
    const color = interpolateColor(val, is_suit);
    const rgba = color.match(/\d+(\.\d+)?/g).map(Number);

    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = Math.round((rgba[3] || 1) * 255);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

async function loadColorizedOverlay(url, is_suit) {
  if (!await checkFileExists(url)) {
    alert("File not found: " + url);
    return;
  }

  if (layer1) {
    map.removeLayer(layer1);
  }

  const bounds = [
    [-35.2, -24.979166], // SW
    [37.6, 51.9791667]   // NE
  ];
  var colorizedUrl;
  
  colorizedUrl= await colorizePNG(url, is_suit);
  
  layer1 = L.imageOverlay(colorizedUrl, bounds, { opacity: 1 }).addTo(map);
 
}

async function loadColorizedOverlay2(url, is_suit) {
  if (!await checkFileExists(url)) {
    alert("File not found: " + url);
    return;
  }

  if (layer2) {
    map2.removeLayer(layer2);
  }

  const bounds = [
    [-35.2, -24.979166], // SW
    [37.6, 51.9791667]   // NE
  ];
  var colorizedUrl;
  
  colorizedUrl= await colorizePNG(url, is_suit);
  
  layer2 = L.imageOverlay(colorizedUrl, bounds, { opacity: 1 }).addTo(map2);
 
}


async function loadColorizedOverlay3(url, is_suit) {
  if (!await checkFileExists(url)) {
    alert("File not found: " + url);
    return;
  }

  if (layer3) {
    map3.removeLayer(layer3);
  }

  const bounds = [
    [-35.2, -24.979166], // SW
    [37.6, 51.9791667]   // NE
  ];
  var colorizedUrl;
  
  colorizedUrl= await colorizePNG(url, is_suit);
  
  layer3 = L.imageOverlay(colorizedUrl, bounds, { opacity: 1 }).addTo(map3)
 
}



function initializeMap1() {
  if (map) return;
  map = L.map("map1").setView([10, 0], 3);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

function initializeMap2() {
  if (map2) return;
  map2 = L.map("map2").setView([10, 0], 3);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map2);
}

function initializeMap3() {
  if (map3) return;
  map3 = L.map("map3").setView([10, 0], 3);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map3);
}

function getSelectedValue(name) {
  const selected = document.querySelector(`input[name="${name}"]:checked`);
  return selected ? selected.value : null;
}

function getDropDownSelectedValue(name) {
  const dropdown = document.getElementById(name + "Select");
  return dropdown ? dropdown.value : null;
}


document.getElementById("cropSelect").addEventListener("change", updateLayer);

async function updateLayer() {
  initializeMap1();
  initializeMap2();
  initializeMap3();

  const crop = getDropDownSelectedValue("crop");
  const ssp = getSelectedValue("ssp");
  
  const solution = getSelectedValue("solution");
  const model = getSelectedValue("model");
  if (ssp == 'historical'){ 
    var period = '1995_2014';
  }
  else{
    var period = getSelectedValue("period");
  }

  const path1 = `src/africa_summary_png/ST0_${model}_${ssp}_${period}_${crop}_bl_suit.png`;
  const path2 = `src/africa_summary_png/ST1_${model}_${ssp}_${period}_${crop}_${solution}_suit.png`;
  
  const path3 = `src/africa_summary_png/${model}_${ssp}_${period}_${crop}_${solution}bl_diff.png`;
  //const path3 = `src/cog/ssp126_2021_2040_wheat_s1s0_suitability.png`;

  if (legend) { map.removeControl(legend); legend = null; }

  await loadColorizedOverlay(path1, true);
  await loadColorizedOverlay2(path2, true);
  await loadColorizedOverlay3(path3, false);

  addLegend(map, true, "legend1");
  addLegend(map2, true, "legend2");
  addLegend(map3, false, "legend3");
}

// Event listeners
["crop", "model", "ssp", "period", "solution"].forEach(name => {
  document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
    el.addEventListener("change", updateLayer);
  });
});

function buildLegendHTML(isSuit) {
  let html = "";
  if (isSuit) {
    html += `<h4>Suitability</h4>`;
    [
      { range: "0–20", color: "rgb(215,212,213)" },
      { range: "20–40", color: "rgb(245,144,83)" },
      { range: "40–60", color: "rgb(254,223,154)" },
      { range: "60–80", color: "rgb(219,240,158)" },
      { range: "80–100", color: "rgb(26,150,65)" }
    ].forEach(l => {
      html += `
        <div style="display:flex;align-items:center;margin-bottom:3px;">
          <i style="background:${l.color};width:18px;height:18px;margin-right:8px;border-radius:3px"></i>
          ${l.range}
        </div>`;
    });
  } 
  else {
    html += `<h4>Absolute difference</h4>`;
    [
  { range: "0 – 1",   color: "rgb(255,255,255)" },   // white
  { range: "1 – 10",  color: "rgb(235,240,255)" },   // very pale blue
  { range: "10 – 20", color: "rgb(180,205,255)" },   // light blue
  { range: "20 – 30", color: "rgb(120,165,235)" },   // blue
  { range: "30 – 40", color: "rgb(80,120,210)" },    // deeper blue
  { range: "40 – 50", color: "rgb(60,85,170)" },     // blue–indigo
  { range: "50 – 60", color: "rgb(55,50,150)" },     // indigo
  { range: "60+",     color: "rgb(95,30,140)" }      // purple
    ].forEach(l => {
      html += `
        <div style="display:flex;align-items:center;margin-bottom:3px;">
          <i style="background:${l.color};border:${l.border || "none"};width:18px;height:18px;margin-right:8px;border-radius:3px"></i>
          ${l.range}
        </div>`;
    });
  }
  return html;
}

// Static legend
function addLegend(mapObj, isSuit, legendVarName) {
  // Remove previous legend from this map if exists
  if (window[legendVarName]) {
    mapObj.removeControl(window[legendVarName]);
  }

  // Create new legend for this map
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.innerHTML = buildLegendHTML(isSuit);
    return div;
  };

  legend.addTo(mapObj);

  // Save as correct global variable
  window[legendVarName] = legend;
}

updateLayer();