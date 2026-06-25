const state = {
  current: null,
  history: [],
};

function setRegimePanel(current) {
  const panel = document.getElementById("regimePanel");
  const color = REGIME_COLORS[current.regime] || REGIME_COLORS.range;
  panel.style.borderLeftColor = color;
  document.getElementById("regimeName").textContent = regimeLabel(current.regime);
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

function fallbackHistoryStarts(asOf) {
  return [110, 90, 60, 45].map((days) => {
    const date = new Date(toIsoDate(asOf));
    date.setDate(date.getDate() - days);
    return yyyymmddFromDate(date);
  });
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function getHistory(asOf) {
  const starts = fallbackHistoryStarts(asOf);
  let lastError;
  for (const start of starts) {
    try {
      return await getJson(`/api/regime/history?start=${start}&end=${asOf}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function setCyclePanel(phase) {
  if (!phase) return;
  const color = REGIME_COLORS[phase.regime] || REGIME_COLORS.range;
  document.getElementById("cycleTitle").textContent = `${regimeLabel(phase.regime)}大周期`;
  document.getElementById("cycleTitle").style.color = color;
  document.getElementById("cycleStart").textContent = `${toIsoDate(phase.startDate)} · 上证 ${phase.startClose}`;
  document.getElementById("cycleEnd").textContent = phase.endDate ? toIsoDate(phase.endDate) : "进行中";
  document.getElementById("cyclePosition").textContent =
    `第 ${phase.elapsedSessions} 个交易日 · 约 ${phase.elapsedYears} 年 · ${phase.returnPct}%`;
}

function phaseFromMajorCycle(cycle) {
  const current = cycle.current_cycle;
  return {
    regime: current.state,
    startDate: current.start_date,
    currentDate: cycle.as_of,
    endDate: current.end_date,
    elapsedSessions: current.elapsed_sessions,
    elapsedYears: current.elapsed_years,
    startClose: current.start_close,
    returnPct: current.return_pct,
  };
}

async function loadDashboard() {
  const button = document.getElementById("refreshButton");
  button.disabled = true;
  button.textContent = "刷新中";
  try {
    const current = await getJson("/api/regime/current");
    const cycle = await getJson("/api/regime/cycle");
    const history = await getHistory(current.as_of);
    const features = await getJson("/api/features/latest");
    state.current = current;
    state.history = history.items || [];
    state.cycle = cycle;
    const phase = phaseFromMajorCycle(cycle);

    setRegimePanel(current);
    setScoreList(features.sub_scores || current.sub_scores);
    setCyclePanel(phase);
    renderRadar("radarChart", features.sub_scores || current.sub_scores);
    renderTimeline("timelineChart", state.history);
    renderIndexChart("indexChart", cycle.series || [], phase);
  } finally {
    button.disabled = false;
    button.textContent = "刷新";
  }
}

document.getElementById("refreshButton").addEventListener("click", loadDashboard);
loadDashboard();
