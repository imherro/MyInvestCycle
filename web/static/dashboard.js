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

function signedPercentText(value) {
  if (typeof value !== "number") return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function cycleBlockMeta(block) {
  const start = toIsoDate(block.start_date);
  const end = block.ongoing ? "至今" : toIsoDate(block.end_date);
  const duration = typeof block.elapsed_years === "number" ? `约 ${block.elapsed_years} 年` : "--";
  return `${start} - ${end} · ${duration} · ${signedPercentText(block.return_pct)}`;
}

function cycleBlockHtml(block) {
  const stateClass = block.state === "bull" ? "bull" : "bear";
  const features = (block.features || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const themes = (block.themes || [])
    .map((theme) => `<span class="theme-chip">${escapeHtml(theme)}</span>`)
    .join("");
  return `
    <article class="cycle-block cycle-block-${stateClass}">
      <div class="cycle-block-main">
        <span>${escapeHtml(regimeLabel(block.state))}</span>
        <strong>${escapeHtml(block.label)}</strong>
        <em>${escapeHtml(cycleBlockMeta(block))}</em>
      </div>
      <div class="cycle-block-detail">
        <h3>${escapeHtml(block.theme_title)}</h3>
        <div class="theme-chips">${themes}</div>
        <ul>${features}</ul>
      </div>
    </article>
  `;
}

function setCycleBlocks(blocks) {
  const target = document.getElementById("cycleBlocks");
  const majorBlocks = (blocks || []).filter((block) => block.major);
  if (!majorBlocks.length) {
    target.innerHTML = '<div class="cycle-blocks-empty">暂无足够长的周期切块。</div>';
    return;
  }
  const basis = majorBlocks.find((block) => block.theme_basis)?.theme_basis || "";
  target.innerHTML = `
    <div class="cycle-blocks-head">
      <div>
        <h2>主要周期切块</h2>
        <p>按市场主周期切分，重点看每轮牛市的主线主题、扩散方式和风险偏好特征。</p>
      </div>
    </div>
    <div class="cycle-block-list">${majorBlocks.map(cycleBlockHtml).join("")}</div>
    <p class="cycle-block-basis">${escapeHtml(basis)}</p>
  `;
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
    setCycleBlocks(cycle.cycle_blocks || []);
    renderRadar("radarChart", current.sub_scores);
    renderIndexChart("indexChart", cycle.series || [], phase, cycle.cycle_blocks || []);
    renderCycleTrackChart("cycleTrackChart", track);
  } finally {
    button.disabled = false;
    button.textContent = "刷新";
  }
}

document.getElementById("refreshButton").addEventListener("click", loadDashboard);
loadDashboard();
