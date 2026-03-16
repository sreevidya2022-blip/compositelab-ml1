const PROPS   = ["Tensile","Youngs","Hardness","Dielectrical"];
const COLORS  = {"Tensile":"#00e5a0","Youngs":"#3d9eff","Hardness":"#f5a623","Dielectrical":"#b06aff"};
const LABELS  = {"Tensile":"Tensile Strength","Youngs":"Young's Modulus","Hardness":"Hardness","Dielectrical":"Dielectrical"};

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
      btn.disabled = false; btn.textContent = "Train Models";
      return;
    }
    const r2s = data.r2_scores;
    status.textContent = "Done! " + Object.entries(r2s).map(([p,v]) =>
      p + ": GPR=" + v.GPR + " GBM=" + v.GBM).join(" | ");
    setTimeout(showApp, 1200);
  } catch(e) {
    status.textContent = "Error: " + e.message;
    btn.disabled = false; btn.textContent = "Train Models";
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
  document.getElementById(id+"-display").textContent = val.toFixed(1) + "%";
}

// ── Predict ────────────────────────────────────────────────────────────────────
async function runPrediction() {
  const bn  = parseFloat(document.getElementById("bn-slider").value);
  const ao  = parseFloat(document.getElementById("ao-slider").value);
  const btn = document.getElementById("predict-btn");
  btn.disabled = true; btn.textContent = "Predicting...";

  // Loading state
  PROPS.forEach(p => {
    document.querySelector("#res-"+p+" .res-value").textContent = "...";
    document.querySelector("#res-"+p+" .res-value").classList.add("loading");
  });

  try {
    const res  = await fetch("/api/predict", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({bn, ao})
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }

    lastPrediction = data;
    renderResults(data.results);
    renderCharts(data.curves, data.exp_data, bn, ao);
    document.getElementById("charts-row").style.display = "grid";

  } catch(e) {
    alert("Prediction error: " + e.message);
  } finally {
    btn.disabled = false; btn.textContent = "Predict Properties";
  }
}

function renderResults(results) {
  PROPS.forEach(prop => {
    const r   = results[prop];
    const el  = document.getElementById("res-"+prop);
    const val = el.querySelector(".res-value");
    const meta= el.querySelector(".res-meta");
    val.textContent = r.value.toFixed(5);
    val.classList.remove("loading");
    el.classList.add("active");
    let metaHtml = `<span class="res-tag ${r.model.toLowerCase()}">${r.model}</span>`;
    metaHtml += `<span class="res-tag">R²=${r.r2}</span>`;
    if (r.uncertainty !== null) {
      metaHtml += `<span class="res-uncert">±${r.uncertainty.toFixed(5)}</span>`;
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
      btn.className = "prop-tab" + (p === activeProp ? " active" : "");
      btn.textContent = LABELS[p];
      btn.onclick = () => {
        activeProp = p;
        document.querySelectorAll(".prop-tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".prop-tab").forEach(b => {
          if (b.textContent === LABELS[p]) b.classList.add("active");
        });
        if (lastPrediction) renderCharts(lastPrediction.curves, lastPrediction.exp_data,
          parseFloat(document.getElementById("bn-slider").value),
          parseFloat(document.getElementById("ao-slider").value));
      };
      el.appendChild(btn);
    });
  });
}

function makeChartData(curves, expData, bn, ao, axis) {
  const c    = curves[activeProp];
  const col  = COLORS[activeProp];
  const sweep = c.sweep;
  const mu   = axis === "bn" ? c.bn_mu : c.ao_mu;
  const sd   = axis === "bn" ? c.bn_sd : c.ao_sd;
  const xkey = axis === "bn" ? "BN" : "AO";

  const upper = mu.map((v,i) => v + sd[i]);
  const lower = mu.map((v,i) => v - sd[i]);

  const expPoints = expData.map(d => ({x: d[xkey], y: d[activeProp]}));
  const myX = axis === "bn" ? bn : ao;
  const myY = lastPrediction ? lastPrediction.results[activeProp].value : null;

  return {
    labels: sweep,
    datasets: [
      {
        label: "Upper bound",
        data: upper, borderWidth: 0,
        backgroundColor: col.replace(")", ",0.12)").replace("rgb","rgba"),
        pointRadius: 0, fill: "+1", tension: 0.4,
      },
      {
        label: LABELS[activeProp],
        data: mu, borderColor: col, borderWidth: 2,
        backgroundColor: "transparent",
        pointRadius: 0, tension: 0.4, fill: false,
      },
      {
        label: "Lower bound",
        data: lower, borderWidth: 0,
        backgroundColor: col.replace(")", ",0.12)").replace("rgb","rgba"),
        pointRadius: 0, fill: "-1", tension: 0.4,
      },
      {
        label: "Experimental",
        data: expPoints, type: "scatter",
        backgroundColor: "#fff", borderColor: "#333", borderWidth: 1.5,
        pointRadius: 5, pointStyle: "circle",
      },
      ...(myY !== null ? [{
        label: "Your input",
        data: [{x: myX, y: myY}], type: "scatter",
        backgroundColor: "#ffed4a", borderColor: "#000", borderWidth: 1.5,
        pointRadius: 8, pointStyle: "star",
      }] : []),
    ]
  };
}

function chartOpts(xLabel) {
  return {
    responsive: true, maintainAspectRatio: false, animation: {duration: 300},
    interaction: {mode: "index", intersect: false},
    plugins: {
      legend: {display: false},
      tooltip: {
        backgroundColor: "#141c24", borderColor: "rgba(255,255,255,0.1)", borderWidth: 1,
        titleColor: "#e8edf2", bodyColor: "#6b7a8d",
        callbacks: {
          title: items => xLabel + " = " + parseFloat(items[0].label).toFixed(1) + "%",
          label: item => item.dataset.label + ": " + (typeof item.raw === "object" ? item.raw.y.toFixed(5) : parseFloat(item.raw).toFixed(5)),
        }
      }
    },
    scales: {
      x: {
        type: "linear", title: {display: true, text: xLabel, color: "#6b7a8d"},
        ticks: {color: "#6b7a8d", maxTicksLimit: 6,
                callback: v => parseFloat(v).toFixed(1) + "%"},
        grid: {color: "rgba(255,255,255,0.04)"},
      },
      y: {
        ticks: {color: "#6b7a8d", maxTicksLimit: 5},
        grid: {color: "rgba(255,255,255,0.04)"},
      }
    }
  };
}

function renderCharts(curves, expData, bn, ao) {
  if (chartBN) { chartBN.destroy(); chartBN = null; }
  if (chartAO) { chartAO.destroy(); chartAO = null; }

  chartBN = new Chart(document.getElementById("chart-bn"), {
    type: "line",
    data: makeChartData(curves, expData, bn, ao, "bn"),
    options: chartOpts("BN %")
  });
  chartAO = new Chart(document.getElementById("chart-ao"), {
    type: "line",
    data: makeChartData(curves, expData, bn, ao, "ao"),
    options: chartOpts("AO %")
  });
}

// ── Chat ───────────────────────────────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById("chat-input");
  const text  = input.value.trim();
  if (!text) return;
  input.value = "";
  appendMsg("user", text);
  chatHistory.push({role: "user", content: text});
  document.getElementById("chat-suggestions").style.display = "none";

  const typingId = appendMsg("ai", "Thinking...", true);

  const body = {
    messages: chatHistory,
    prediction_context: lastPrediction ? {
      bn: lastPrediction.bn,
      ao: lastPrediction.ao,
      results: lastPrediction.results,
    } : null
  };

  try {
    const res  = await fetch("/api/chat", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    removeMsg(typingId);
    if (data.error) {
      appendMsg("ai", "Error: " + data.error);
      return;
    }
    appendMsg("ai", data.reply);
    chatHistory.push({role: "assistant", content: data.reply});
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  } catch(e) {
    removeMsg(typingId);
    appendMsg("ai", "Connection error. Please try again.");
  }
}

function quickAsk(text) {
  document.getElementById("chat-input").value = text;
  sendChat();
}

let msgId = 0;
function appendMsg(role, text, typing=false) {
  const id  = "msg-" + (++msgId);
  const box = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.id = id;
  div.className = "msg msg-" + role + (typing ? " msg-typing" : "");
  div.innerHTML = `<div class="msg-bubble">${text.replace(/\n/g,"<br>")}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function removeMsg(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
