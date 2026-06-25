const state = {
  current: null,
  history: [],
};

function setRegimePanel(current) {
  const panel = document.getElementById("regimePanel");
  const color = REGIME_COLORS[current.regime] || REGIME_COLORS.range;
  panel.style.borderLeftColor = color;
  document.getElementById("regimeName").textContent = current.regime;
  document.getElementById("regimeName").style.color = color;
  document.getElementById("asOf").textContent = toIsoDate(current.as_of);
  document.getElementById("confidenceValue").textContent = scorePercent(current.confidence);
  document.getElementById("regimeScoreValue").textContent = scorePercent(current.regime_score);
}

function setScoreList(scores) {
  const labels = [
    ["trend", "趋势"],
    ["breadth", "宽度"],
    ["liquidity", "流动性"],
    ["volatility", "波动稳定"],
  ];
  document.getElementById("scoreList").innerHTML = labels
    .map(([key, label]) => `<div class="score-chip"><span>${label}</span><strong>${scorePercent(scores[key])}</strong></div>`)
    .join("");
}

function yyyymmddFromDate(date) {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function historyStart(asOf) {
  const date = new Date(toIsoDate(asOf));
  date.setDate(date.getDate() - 45);
  return yyyymmddFromDate(date);
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function loadDashboard() {
  const button = document.getElementById("refreshButton");
  button.disabled = true;
  button.textContent = "刷新中";
  try {
    const current = await getJson("/api/regime/current");
    const start = historyStart(current.as_of);
    const history = await getJson(`/api/regime/history?start=${start}&end=${current.as_of}`);
    const features = await getJson("/api/features/latest");
    state.current = current;
    state.history = history.items || [];

    setRegimePanel(current);
    setScoreList(features.sub_scores || current.sub_scores);
    renderRadar("radarChart", features.sub_scores || current.sub_scores);
    renderTimeline("timelineChart", state.history);
    renderIndexChart("indexChart", state.history);
  } finally {
    button.disabled = false;
    button.textContent = "刷新";
  }
}

document.getElementById("refreshButton").addEventListener("click", loadDashboard);
loadDashboard();
