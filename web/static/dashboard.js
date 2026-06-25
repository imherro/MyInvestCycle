const state = {
  current: null,
  cycle: null,
  track: null,
  results: null,
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

function fixedText(value, digits = 3) {
  if (typeof value !== "number") return "--";
  return value.toFixed(digits);
}

function integerText(value) {
  if (typeof value !== "number") return "--";
  return value.toLocaleString("zh-CN");
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

function riskLevelLabel(value) {
  const labels = { low: "低风险", medium: "中风险", high: "高风险" };
  return labels[value] || value || "--";
}

function actionLabel(value) {
  const labels = { reduce: "降低", increase: "提高", hold: "维持" };
  return labels[value] || value || "--";
}

function executionActionLabel(value) {
  const labels = {
    reduce_exposure: "降低仓位",
    rebalance_strategy: "策略再平衡",
    open_new_position: "新开仓",
    increase_exposure: "提高仓位",
    increase_leverage: "增加杠杆",
    trim_overweight: "削减超配",
    hedge: "对冲",
  };
  return labels[value] || value || "--";
}

function executionModeLabel(value) {
  const labels = {
    expand_or_rebalance: "扩张/再平衡",
    rebalance_strategy: "策略再平衡",
    defensive_only: "仅防御",
    reduce_risk: "降低风险",
  };
  return labels[value] || value || "--";
}

function strategyLabel(value) {
  const labels = {
    trend: "趋势",
    breakout: "突破",
    defensive: "防御",
    trend_following: "趋势跟随",
    mean_reversion: "均值回归",
    defensive_cash: "防御现金",
    reduce_trading: "降低交易频率",
  };
  return labels[value] || value || "--";
}

function componentLabel(value) {
  const labels = {
    volatility_stress: "波动压力",
    breadth_weakness: "市场宽度偏弱",
    trend_weakness: "趋势偏弱",
    liquidity_weakness: "流动性偏弱",
  };
  return labels[value] || value;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function setResultsPanel(results) {
  const risk = results.risk || {};
  const decision = risk.decision || {};
  const portfolio = (results.portfolio || {}).allocation || {};
  const route = (results.strategy_route || {}).route || {};
  const execution = (results.execution || {}).simulation || {};
  const hazard = results.hazard || {};
  const survival = results.survival || {};
  const validation = results.model_validation || {};
  const defaultModel = validation.default || {};
  const model = defaultModel.model || {};
  const volatility = defaultModel.volatility_only || {};
  const sensitivity = validation.sensitivity || {};
  const structuralHazard = hazard.structural || {};
  const rawHazard = hazard.raw || {};
  const structuralSurvival = survival.structural || {};

  setText("resultsAsOf", `截至 ${toIsoDate(results.as_of)}`);
  setText("riskLevel", riskLevelLabel(decision.risk_level));
  document.getElementById("riskLevel").className = `risk-level-text risk-${decision.risk_level || "medium"}`;
  setText("recommendedExposure", percentText(decision.recommended_exposure));
  setText("riskAction", actionLabel(decision.action));
  setText("riskScore", fixedText(decision.risk_score, 3));
  setText("strategyMode", strategyLabel(decision.strategy_mode));
  setText("riskAlert", decision.alert || "--");
  document.getElementById("riskComponents").innerHTML = Object.entries(decision.risk_components || {})
    .map(
      ([key, value]) => `
        <div class="component-row">
          <span>${componentLabel(key)}</span>
          <strong>${percentText(value)}</strong>
          <i style="width:${typeof value === "number" ? Math.round(value * 100) : 0}%"></i>
        </div>
      `
    )
    .join("");

  setText("portfolioExposure", percentText(portfolio.total_exposure));
  setText("portfolioCash", percentText(portfolio.cash_ratio));
  const constraints = portfolio.constraints || {};
  const constraintOk =
    constraints.cash_plus_exposure === 1 &&
    constraints.min_cash_satisfied === true &&
    constraints.max_exposure_satisfied === true &&
    constraints.strategy_allocation_sum === 1;
  setText("portfolioConstraint", constraintOk ? "通过" : "需检查");
  document.getElementById("strategyAllocation").innerHTML = Object.entries(portfolio.strategy_allocation || {})
    .map(
      ([strategy, weight]) => `
        <div class="allocation-row">
          <span>${strategyLabel(strategy)}</span>
          <strong>${percentText(weight)}</strong>
          <i style="width:${typeof weight === "number" ? Math.round(weight * 100) : 0}%"></i>
        </div>
      `
    )
    .join("");
  setText(
    "portfolioConclusion",
    `R2.1 使用当前 ${regimeLabel(portfolio.regime)} 状态和风险评分 ${fixedText(portfolio.risk_score, 3)}，将风险资产仓位控制在 ${percentText(portfolio.total_exposure)}，其余保持现金。`
  );

  const enabledStrategies = route.enabled_strategies || [];
  const disabledStrategies = route.disabled_strategies || [];
  setText("routeEnabledCount", integerText(enabledStrategies.length));
  setText("routeDisabledCount", integerText(disabledStrategies.length));
  document.getElementById("routeEnabledList").innerHTML = enabledStrategies.length
    ? enabledStrategies.map((strategy) => `<span>${strategyLabel(strategy)}</span>`).join("")
    : "<em>无启用策略</em>";
  document.getElementById("routeBudgetList").innerHTML = Object.entries(route.strategy_budget || {})
    .map(
      ([strategy, weight]) => `
        <div class="allocation-row route-budget-row">
          <span>${strategyLabel(strategy)}</span>
          <strong>${percentText(weight)}</strong>
          <i style="width:${typeof weight === "number" ? Math.round(weight * 100) : 0}%"></i>
        </div>
      `
    )
    .join("");
  setText("routeExecutionStatus", route.constraints?.no_trade_execution ? "仅约束，不执行" : "需检查");
  const disabledReason = route.disabled_reason || {};
  const disabledText = disabledStrategies.length
    ? disabledStrategies.map((strategy) => `${strategyLabel(strategy)}: ${disabledReason[strategy] || "policy"}`).join("；")
    : "无禁用策略";
  setText(
    "routeConclusion",
    `R2.2 将组合资金路由到 ${enabledStrategies.map(strategyLabel).join("、") || "无"}；禁用原因：${disabledText}。`
  );

  const intent = execution.execution_intent || {};
  const simulatedOrders = execution.simulated_orders || [];
  setText("executionMode", executionModeLabel(intent.execution_mode));
  setText("executionOrderCount", integerText(simulatedOrders.length));
  setText("allowedActions", (intent.allowed_actions || []).map(executionActionLabel).join("、") || "--");
  setText("forbiddenActions", (intent.forbidden_actions || []).map(executionActionLabel).join("、") || "--");
  document.getElementById("simulatedOrders").innerHTML = simulatedOrders
    .map((order) => {
      const size = typeof order.weight_change === "number"
        ? signedPercentText(order.weight_change * 100)
        : percentText(order.target_weight);
      const target = order.strategy ? ` · ${strategyLabel(order.strategy)}` : "";
      return `
        <div class="simulated-order-row">
          <span>${executionActionLabel(order.action)}${target}</span>
          <strong>${size}</strong>
          <em>${escapeHtml(order.reason || "")}</em>
        </div>
      `;
    })
    .join("");
  setText(
    "executionConclusion",
    execution.constraints?.no_real_orders
      ? "R3.1 只生成执行意图和模拟指令，不连接券商，不产生真实订单。"
      : "执行约束需要检查。"
  );

  setText("hazardRawRate", percentText(rawHazard.event_rate));
  setText("hazardStructuralRate", percentText(structuralHazard.event_rate));
  setText("hazardRows", integerText(structuralHazard.observations));
  setText(
    "hazardConclusion",
    `结构化切分把跳变事件从 ${integerText(rawHazard.events)} 次压缩到 ${integerText(structuralHazard.events)} 次，减少日内噪声后更适合观察主周期风险。`
  );

  setText("modelAuc", fixedText(model.roc_auc, 3));
  setText("modelLift", fixedText(model.lift_vs_random, 2));
  setText("volatilityAuc", fixedText(volatility.roc_auc, 3));
  setText("sensitivityRange", `${fixedText(sensitivity.auc_min, 3)} - ${fixedText(sensitivity.auc_max, 3)}`);
  const modelGap = typeof volatility.roc_auc === "number" && typeof model.roc_auc === "number"
    ? model.roc_auc - volatility.roc_auc
    : null;
  const modelDirection = typeof modelGap === "number" && modelGap < 0 ? "弱于" : "强于";
  setText(
    "modelConclusion",
    `默认模型相对随机基准有正向识别力，但敏感性并非全部通过；默认口径下多因子模型${modelDirection}波动单因子。`
  );

  setText("survivalEventRate", percentText(structuralSurvival.event_rate));
  setText("survivalEvents", integerText(structuralSurvival.events));
  setText("survivalRows", integerText(structuralSurvival.observations));
  const durationOrder = ["bull", "range", "bear", "transition"];
  const durations = structuralSurvival.durations || {};
  document.getElementById("durationList").innerHTML = durationOrder
    .filter((key) => durations[key])
    .map((key) => {
      const item = durations[key];
      return `
        <div class="duration-row">
          <span>${regimeLabel(key)}</span>
          <strong>最长 ${integerText(item.max_duration)} 日</strong>
          <em>平均 ${fixedText(item.avg_duration, 1)} 日</em>
        </div>
      `;
    })
    .join("");

  document.getElementById("conclusionList").innerHTML = listHtml(results.conclusions || []);
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
  const majorBlocks = (blocks || []).filter((block) => block.major).reverse();
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
    const [current, cycle, track, results] = await Promise.all([
      getJson("/api/regime/current"),
      getJson("/api/regime/cycle"),
      getJson("/api/regime/cycle/track"),
      getJson("/api/results/summary"),
    ]);
    state.current = current;
    state.cycle = cycle;
    state.track = track;
    state.results = results;
    const phase = phaseFromMajorCycle(cycle);

    setRegimePanel(current);
    setScoreList(current.sub_scores);
    setCyclePanel(phase);
    setResultsPanel(results);
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
