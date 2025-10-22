  let map;
  let currentLayer = null;
  let legend = null; // ✅ define legend globally

  // 🌈 Color map definition
  const colorMap = [
    { value: 0, color: [215, 212, 213] },
    { value: 20, color: [245, 144, 83] },
    { value: 40, color: [254, 223, 154] },
    { value: 60, color: [219, 240, 158] },
    { value: 80, color: [138, 204, 98] },
    { value: 100, color: [26, 150, 65] }
  ];

  // --- Interpolate color ---
  function interpolateColor(val) {
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
  }

  async function checkFileExists(url) {
    try {
      const resp = await fetch(url, { method: "HEAD" });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // 🖼️ Colorize grayscale PNG and hide -1 (value 0)
  async function colorizePNG(url) {
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
      const color = interpolateColor(val);
      const rgba = color.match(/\d+(\.\d+)?/g).map(Number);

      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = Math.round((rgba[3] || 1) * 255);
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }

  async function loadColorizedOverlay(url) {
    if (!await checkFileExists(url)) {
      alert("File not found: " + url);
      return;
    }

    if (currentLayer) {
      map.removeLayer(currentLayer);
      currentLayer = null;
    }

    const bounds = [
      [-35.2, -24.979166], // SW
      [37.6, 51.9791667]   // NE
    ];
    const colorizedUrl = await colorizePNG(url);
    currentLayer = L.imageOverlay(colorizedUrl, bounds, { opacity: 1 }).addTo(map);
    console.log("🖼️ Colorized PNG loaded:", url);
  }

  function initializeMap() {
    if (map) return;
    map = L.map("map").setView([10, 0], 3);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
  }

  function getSelectedValue(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : null;
  }

  async function updateLayer() {
    initializeMap();
    const crop = getSelectedValue("crop");
    const ssp = getSelectedValue("ssp");
    const period = getSelectedValue("period");
    const solution = getSelectedValue("solution");
    const path = `src/cog/${ssp}_${period}_${crop}_${solution}_suitability.png`;
    await loadColorizedOverlay(path);
    addLegend(); // ✅ legend now works
  }

  // Event listeners
  ["crop", "ssp", "period", "solution"].forEach(name => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
      el.addEventListener("change", updateLayer);
    });
  });

  document.getElementById("cleanBtn").addEventListener("click", () => {
    if (currentLayer) {
      map.removeLayer(currentLayer);
      currentLayer = null;
    }
    if (legend) {
      map.removeControl(legend);
      legend = null;
    }
    console.log("🧹 Map cleared.");
  });

  // ✅ Static legend
  function addLegend() {
    if (legend) map.removeControl(legend);

    legend = L.control({ position: "bottomright" });

    legend.onAdd = function () {
      const div = L.DomUtil.create("div", "info legend");
      const levels = [
        { range: "0 - 20", color: "rgb(215,212,213)", label: "" },
        { range: "20 - 40", color: "rgb(245,144,83)", label: "" },
        { range: "40 - 60", color: "rgb(254,223,154)", label: "" },
        { range: "60 - 80", color: "rgb(219,240,158)", label: "" },
        { range: "80 - 100", color: "rgb(26,150,65)", label: "" }
      ];

      div.innerHTML = "<h4>Suitability</h4>";
      levels.forEach(l => {
        div.innerHTML += `
          <div style="display:flex;align-items:center;margin-bottom:3px;">
            <i style="background:${l.color};width:18px;height:18px;margin-right:8px;border-radius:3px;opacity:0.9;"></i>
            ${l.range} 
          </div>`;
      });
      return div;
    };

    legend.addTo(map);
  }

  // 🧭 Auto-load initial layer
  updateLayer();