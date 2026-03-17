const PROPS   = ["Tensile","Youngs","Hardness","Buckling"];

const COLORS  = {
  "Tensile":"#00e5a0",
  "Youngs":"#3d9eff",
  "Hardness":"#f5a623",
  "Buckling":"#b06aff"
};

const LABELS  = {
  "Tensile":"Tensile Strength",
  "Youngs":"Young's Modulus",
  "Hardness":"Hardness",
  "Buckling":"Buckling Load"
};

let chartBN    = null;
let chartAO    = null;
let activeProp = "Tensile";
let lastPrediction = null;
let chatHistory    = [];

// ── Check if models are already loaded ────────────────────────────────────────
fetch("/api/status").then(r => r.json()).then(d => {
  if (d.models_loaded) showApp();
});

// ── File input listeners ───────────────────────────────────────────────────────
["theory","fea","exp"].forEach(key => {
  document.getElementById("file-" + key).addEventListener("change", function() {
    if (this.files[0]) {
      document.getElementById("name-" + key).textContent = this.files[0].name;
      document.getElementById("drop-" + key).classList.add("has-file");
    }
    checkFilesReady();
  });
});

function checkFilesReady() {
  const ready = ["theory","fea","exp"].every(k => document.getElementById("file-"+k).files[0]);
  document.getElementById("train-btn").disabled = !ready;
}

// ── Train models ───────────────────────────────────────────────────────────────
async function trainModels() {

  const btn = document.getElementById("train-btn");
  const status = document.getElementById("train-status");

  btn.disabled = true;
  btn.textContent = "Training...";

  status.textContent = "Uploading datasets and training models — this takes ~20 seconds...";

  const form = new FormData();
  form.append("theory", document.getElementById("file-theory").files[0]);
  form.append("fea",    document.getElementById("file-fea").files[0]);
  form.append("exp",    document.getElementById("file-exp").files[0]);

  try {

    const res  = await fetch("/api/train", { method: "POST", body: form });
    const data = await res.json();

    if (data.error) {
      status.textContent = "Error: " + data.error;
      btn.disabled = false;
      btn.textContent = "Train Models";
      return;
    }

    const r2s = data.r2_scores;

    status.textContent =
      "Done! " +
      Object.entries(r2s)
        .map(([p,v]) => p + ": GPR=" + v.GPR + " GBM=" + v.GBM)
        .join(" | ");

    setTimeout(showApp, 1200);

  } catch(e) {

    status.textContent = "Error: " + e.message;
    btn.disabled = false;
    btn.textContent = "Train Models";

  }
}

function showApp() {

  document.getElementById("upload-section").style.display = "none";
  document.getElementById("app-section").style.display = "block";

  document.getElementById("model-status").textContent = "● Models loaded";
  document.getElementById("model-status").classList.add("loaded");

  buildTabs();
}

// ── Sliders ────────────────────────────────────────────────────────────────────
function updateSlider(id) {

  const val = parseFloat(document.getElementById(id+"-slider").value);

  document.getElementById(id+"-display").textContent =
    val.toFixed(1) + "%";
}

// ── Predict ────────────────────────────────────────────────────────────────────
async function runPrediction() {

  const bn  = parseFloat(document.getElementById("bn-slider").value);
  const ao  = parseFloat(document.getElementById("ao-slider").value);

  const btn = document.getElementById("predict-btn");

  btn.disabled = true;
  btn.textContent = "Predicting...";

  PROPS.forEach(p => {
    document.querySelector("#res-"+p+" .res-value").textContent = "...";
    document.querySelector("#res-"+p+" .res-value").classList.add("loading");
  });

  try {

    const res  = await fetch("/api/predict", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({bn, ao})
    });

    const data = await res.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    lastPrediction = data;

    renderResults(data.results);

    renderCharts(
      data.curves,
      data.exp_data,
      bn,
      ao
    );

    document.getElementById("charts-row").style.display = "grid";

  } catch(e) {

    alert("Prediction error: " + e.message);

  } finally {

    btn.disabled = false;
    btn.textContent = "Predict Properties";

  }
}

// ── Render results ─────────────────────────────────────────────────────────────
function renderResults(results) {

  PROPS.forEach(prop => {

    const r   = results[prop];

    const el  = document.getElementById("res-"+prop);
    const val = el.querySelector(".res-value");
    const meta= el.querySelector(".res-meta");

    val.textContent = r.value.toFixed(5);

    val.classList.remove("loading");

    el.classList.add("active");

    let metaHtml =
      `<span class="res-tag ${r.model.toLowerCase()}">${r.model}</span>`;

    metaHtml +=
      `<span class="res-tag">R²=${r.r2}</span>`;

    if (r.uncertainty !== null) {

      metaHtml +=
        `<span class="res-uncert">±${r.uncertainty.toFixed(5)}</span>`;

    }

    meta.innerHTML = metaHtml;

  });
}

// ── Charts ─────────────────────────────────────────────────────────────────────
function buildTabs() {

  ["bn","ao"].forEach(axis => {

    const el = document.getElementById("tabs-"+axis);

    el.innerHTML = "";

    PROPS.forEach(p => {

      const btn = document.createElement("button");

      btn.className =
        "prop-tab" + (p === activeProp ? " active" : "");

      btn.textContent = LABELS[p];

      btn.onclick = () => {

        activeProp = p;

        document
          .querySelectorAll(".prop-tab")
          .forEach(b => b.classList.remove("active"));

        document
          .querySelectorAll(".prop-tab")
          .forEach(b => {
            if (b.textContent === LABELS[p])
              b.classList.add("active");
          });

        if (lastPrediction)
          renderCharts(
            lastPrediction.curves,
            lastPrediction.exp_data,
            parseFloat(document.getElementById("bn-slider").value),
            parseFloat(document.getElementById("ao-slider").value)
          );
      };

      el.appendChild(btn);

    });
  });
}

// ── Inverse Prediction ─────────────────────────────────────────────────────────
async function runInverse() {

  const tensile  = document.getElementById("inv-tensile").value.trim();
  const youngs   = document.getElementById("inv-youngs").value.trim();
  const hardness = document.getElementById("inv-hardness").value.trim();
  const buckling = document.getElementById("inv-buckling").value.trim();

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

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        tensile:  tensile  || null,
        youngs:   youngs   || null,
        hardness: hardness || null,
        buckling: buckling || null

      })
    });

    const data = await res.json();

    if (data.error) {
      errEl.textContent = data.error;
      return;
    }

    renderInverseResult(data, {

      Tensile:  tensile  ? parseFloat(tensile)  : null,
      Youngs:   youngs   ? parseFloat(youngs)   : null,
      Hardness: hardness ? parseFloat(hardness) : null,
      Buckling: buckling ? parseFloat(buckling) : null

    });

  } catch (e) {

    errEl.textContent = "Network error: " + e.message;

  } finally {

    btn.disabled = false;
    btn.textContent = "Find Optimal Composition";

  }
}
