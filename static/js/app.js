// 1. Update Core Constants
const PROPS   = ["Tensile", "Youngs", "Hardness", "Buckling"];
const COLORS  = {
    "Tensile": "#00e5a0", 
    "Youngs": "#3d9eff", 
    "Hardness": "#f5a623", 
    "Buckling": "#b06aff" // Kept the purple color for Buckling
};
const LABELS  = {
    "Tensile": "Tensile Strength", 
    "Youngs": "Young's Modulus", 
    "Hardness": "Hardness", 
    "Buckling": "Buckling Load"
};

let chartBN    = null;
let chartAO    = null;
let activeProp = "Tensile";
let lastPrediction = null;
let chatHistory    = [];

// ... (fetch and file listeners remain the same) ...

// 2. Update Inverse Prediction Logic (around line 220)
async function runInverse() {
  const tensile  = document.getElementById("inv-tensile").value.trim();
  const youngs   = document.getElementById("inv-youngs").value.trim();
  const hardness = document.getElementById("inv-hardness").value.trim();
  const buckling = document.getElementById("inv-buckling").value.trim(); // Changed from dielectrical

  const errEl = document.getElementById("inv-error");
  errEl.textContent = "";

  if (!tensile && !youngs && !hardness && !buckling) {
    errEl.textContent = "Enter at least one target property.";
    return;
  }

  const btn = document.getElementById("inv-run-btn");
  btn.disabled = true;
  btn.textContent = "Optimising...";

  try {
    const res = await fetch("/api/inverse_predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tensile:  tensile  || null,
        youngs:   youngs   || null,
        hardness: hardness || null,
        buckling: buckling || null, // Updated key
      })
    });
    const data = await res.json();
    if (data.error) { errEl.textContent = data.error; return; }

    renderInverseResult(data, {
      Tensile:  tensile  ? parseFloat(tensile)  : null,
      Youngs:   youngs   ? parseFloat(youngs)   : null,
      Hardness: hardness ? parseFloat(hardness) : null,
      Buckling: buckling ? parseFloat(buckling) : null, // Updated key
    });
    renderInverseHeatmap(data);

  } catch (e) {
    errEl.textContent = "Network error: " + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Find Optimal Composition";
  }
}

// 3. Update result renderer label mapping (around line 278)
function renderInverseResult(d, targets) {
  // ... (setup code remains same) ...

  const grid = document.getElementById("inv-achieved-grid");
  grid.innerHTML = PROPS.map(prop => {
    const a = d.achieved[prop];
    const target = targets[prop];
    let valClass = "";
    let pctStr = "";
    if (target !== null) {
      const pct = Math.abs((a.value - target) / target) * 100;
      valClass = pct < 2 ? "match" : pct < 8 ? "close" : "off";
      pctStr = `<div class="inv-achieved-pct">Δ ${pct.toFixed(1)}%</div>`;
    }
    const unc = a.uncertainty
      ? `<div class="inv-achieved-unc">±${a.uncertainty}</div>` : "";
    const tgt = target !== null
      ? `<div class="inv-achieved-target">target: ${target}</div>` : "";
      
    // UPDATED MAPPING HERE
    const label = {
        "Tensile": "Tensile", 
        "Youngs": "Young's Mod.", 
        "Hardness": "Hardness", 
        "Buckling": "Buckling Load"
    }[prop];
    
    const unit = a.unit ? ` ${a.unit}` : "";
    return `
      <div class="inv-achieved-item">
        <div class="inv-achieved-prop">${label}${unit}</div>
        <div class="inv-achieved-val ${valClass}">${a.value}</div>
        ${unc}${pctStr}${tgt}
      </div>`;
  }).join("");
}
