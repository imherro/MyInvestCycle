const state = {
  current: null,
  cycle: null,
  track: null,
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

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
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

function percentText(value) {
  if (typeof value !== "number") return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function priceText(value) {
  if (typeof value !== "number") return "--";
  return value.toFixed(2);
}

function setProbability(id, barId, value) {
  document.getElementById(id).textContent = percentText(value);
  document.getElementById(barId).style.width = typeof value === "number" ? `${Math.round(value * 100)}%` : "0";
}

function listHtml(items) {
  return (items || []).map((item) => `<li>${item}</li>`).join("");
}

function setForecastPanel(track) {
  const forecast = track.forecast || {};
  const probabilities = forecast.probabilities || {};
  const levels = forecast.key_levels || {};
  const explanation = forecast.explanation || {};
  document.getElementById("trackRange").textContent =
    `${toIsoDate(track.cycle.start_date)} 至 ${toIsoDate(track.as_of)}`;
  document.getElementById("forecastHorizon").textContent = forecast.basis_horizon_sessions || "--";
  document.getElementById("forecastSample").textContent = forecast.sample_size ? `样本 ${forecast.sample_size}` : "样本不足";
  setProbability("probContinue", "barContinue", probabilities.continue);
  setProbability("probRange", "barRange", probabilities.range);
  setProbability("probWeaken", "barWeaken", probabilities.weaken);
  document.getElementById("projectionList").innerHTML = (forecast.paths || [])
    .map(
      (path) => `
        <div class="projection-row">
          <span>${path.horizon_sessions}日</span>
          <div>
            <strong>${priceText(path.neutral)}</strong>
            <small>谨慎 ${priceText(path.cautious)} / 乐观 ${priceText(path.optimistic)} · 中性 ${path.median_return_pct}%</small>
          </div>
        </div>
      `
    )
    .join("");
  document.getElementById("keyLevels").innerHTML = [
    ["当前收盘", priceText(levels.current_close)],
    ["MA120", priceText(levels.ma120)],
    ["MA250", priceText(levels.ma250)],
    ["60日回撤", typeof levels.drawdown_60_pct === "number" ? `${levels.drawdown_60_pct}%` : "--"],
  ]
    .map(([label, value]) => `<div class="level-row"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
  document.getElementById("explanationSummary").textContent = explanation.summary || "--";
  document.getElementById("explanationFacts").innerHTML = listHtml(explanation.facts);
  document.getElementById("explanationMethod").innerHTML = listHtml(explanation.method);
  document.getElementById("explanationResult").textContent = explanation.result || "--";
}

async function loadDashboard() {
  const button = document.getElementById("refreshButton");
  button.disabled = true;
  button.textContent = "刷新中";
  try {
    const [current, cycle, track] = await Promise.all([
      getJson("/api/regime/current"),
      getJson("/api/regime/cycle"),
      getJson("/api/regime/cycle/track"),
    ]);
    state.current = current;
    state.cycle = cycle;
    state.track = track;
    const phase = phaseFromMajorCycle(cycle);

    setRegimePanel(current);
    setScoreList(current.sub_scores);
    setCyclePanel(phase);
    setForecastPanel(track);
    renderRadar("radarChart", current.sub_scores);
    renderIndexChart("indexChart", cycle.series || [], phase);
    renderCycleTrackChart("cycleTrackChart", track);
  } finally {
    button.disabled = false;
    button.textContent = "刷新";
  }
}

document.getElementById("refreshButton").addEventListener("click", loadDashboard);
loadDashboard();
