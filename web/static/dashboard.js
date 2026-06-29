const state = {
  current: null,
  cycle: null,
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
  const requestUrl = new URL(url, window.location.origin);
  requestUrl.searchParams.set("_t", Date.now().toString());
  const response = await fetch(requestUrl.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
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

function signedRatioText(value) {
  if (typeof value !== "number") return "--";
  return signedPercentText(value * 100);
}

function fixedText(value, digits = 3) {
  if (typeof value !== "number") return "--";
  return value.toFixed(digits);
}

function drawdownReductionText(value) {
  if (typeof value !== "number") return "--";
  const percent = Math.abs(value * 100).toFixed(1);
  if (value > 0) return `策略少 ${percent}pct`;
  if (value < 0) return `策略多 ${percent}pct`;
  return "持平";
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

function boundaryLabel(value) {
  const labels = {
    no_stock_selection: "不选股",
    no_trade_execution: "不执行交易",
    no_real_orders: "无真实订单",
    no_broker_connection: "无券商连接",
    simulation_only: "仅模拟",
  };
  return labels[value] || value || "--";
}

function metaEdgeLevelLabel(value) {
  const labels = {
    quiet: "平静",
    low: "轻微矛盾",
    medium: "矛盾升温",
    high: "高矛盾",
  };
  return labels[value] || value || "--";
}

function metaSignalLabel(value) {
  const labels = {
    regime_risk_divergence: "状态-风险分歧",
    hazard_mismatch: "结构风险加速",
    portfolio_gap: "组合-策略错位",
    regime_age: "周期年龄异常",
  };
  return labels[value] || value || "--";
}

function alphaSourceLabel(value) {
  const labels = {
    bull_support: "牛市支持",
    bull_drag: "牛市拖累",
    range_support: "震荡支持",
    range_cost: "震荡成本",
    bear_protection: "熊市保护",
    bear_cost: "熊市成本",
    transition_support: "过渡支持",
    transition_cost: "过渡成本",
  };
  return labels[value] || value || "--";
}

function styleLabel(value) {
  const labels = {
    growth: "成长",
    value: "价值",
    low_vol: "低波",
    dividend: "红利",
    small_cap: "小盘",
    cash_proxy: "现金代理",
  };
  return labels[value] || value || "--";
}

function rotationSignalLabel(value) {
  if (!value) return "--";
  if (value === "hold_universe") return "保持观察池";
  if (value === "insufficient_data") return "样本不足";
  if (value.startsWith("rotate_to_")) {
    return `转向${styleLabel(value.replace("rotate_to_", ""))}`;
  }
  return value;
}

function confidenceLevelLabel(value) {
  const labels = {
    high: "高",
    medium: "中",
    low: "低",
    insufficient: "不足",
  };
  return labels[value] || value || "--";
}

function metaEdgeInterpretationText(metaEdge) {
  const level = metaEdge.meta_edge_level;
  const activeSignals = metaEdge.signals || [];
  if (level === "high") return "系统内部矛盾较高，多层输出正在相互冲突";
  if (level === "medium") return "系统内部矛盾正在升温，提高风险前应先复核触发信号";
  if (activeSignals.length) return "存在局部系统矛盾，但还不是主导信号";
  return "系统各层整体一致，当前没有显著 Meta Edge 信号";
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

function setBacktestComparisonTable(targetId, rows) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `
    <div class="backtest-comparison-row backtest-comparison-head">
      <span>标的</span>
      <span>收益</span>
      <span>最大回撤</span>
      <span>收益差</span>
      <span>回撤差</span>
    </div>
    ${rows
      .map(
        (item) => `
          <div class="backtest-comparison-row${item.isStrategy ? " is-strategy" : ""}">
            <strong>${escapeHtml(item.label || item.code || "--")}</strong>
            <span>${signedRatioText(item.total_return)}</span>
            <span>${percentText(item.max_drawdown)}</span>
            <span>${item.isStrategy ? "--" : signedRatioText(item.return_advantage)}</span>
            <span>${item.isStrategy ? "--" : drawdownReductionText(item.drawdown_reduction)}</span>
          </div>
        `
      )
      .join("")}
  `;
}

function setEtfBacktestComparisonTable(summary) {
  const comparisonEtfs = (summary.comparison_etfs || []).map((item) => ({
    ...item,
    return_advantage: item.rotation_return_advantage,
    drawdown_reduction: item.rotation_drawdown_reduction,
  }));
  setBacktestComparisonTable("backtestEtfComparison", [
    {
      label: "轮动策略",
      total_return: summary.rotation_total_return,
      max_drawdown: summary.max_drawdown,
      isStrategy: true,
    },
    ...comparisonEtfs,
  ]);
}

function setMacroStyleComparisonTable(summary) {
  const strategyReturn = summary.hierarchical_total_return;
  const strategyDrawdown = summary.max_drawdown;
  const comparisonRows = [
    {
      label: "当前 A1 轮动",
      total_return: summary.current_a1_return,
      max_drawdown: summary.current_a1_max_drawdown,
    },
    {
      label: "价值/大盘 510300 沪深300ETF",
      total_return: summary.benchmark_510300_return,
      max_drawdown: summary.benchmark_510300_max_drawdown,
    },
    {
      label: "中小盘 510500 中证500ETF",
      total_return: summary.benchmark_510500_return,
      max_drawdown: summary.benchmark_510500_max_drawdown,
    },
    {
      label: "等权 ETF Basket",
      total_return: summary.equal_weight_basket_return,
      max_drawdown: summary.equal_weight_basket_max_drawdown,
    },
  ].map((item) => ({
    ...item,
    return_advantage:
      typeof strategyReturn === "number" && typeof item.total_return === "number"
        ? strategyReturn - item.total_return
        : null,
    drawdown_reduction:
      typeof strategyDrawdown === "number" && typeof item.max_drawdown === "number"
        ? Math.abs(item.max_drawdown) - Math.abs(strategyDrawdown)
        : null,
  }));
  setBacktestComparisonTable("macroStyleComparison", [
    {
      label: "M2.1 分层组合",
      total_return: strategyReturn,
      max_drawdown: strategyDrawdown,
      isStrategy: true,
    },
    ...comparisonRows,
  ]);
}

function setApiCatalogPanel(catalog) {
  const docs = catalog.docs || {};
  const groups = catalog.groups || [];
  const recommended = catalog.recommended_entrypoints || [];
  const safety = catalog.safety || {};
  const safetyOk = Object.values(safety).every((value) => value === true);

  setText("apiEndpointCount", integerText(catalog.total_endpoints));
  setText("apiDocsStatus", docs.interactive ? `已开放 ${docs.interactive}` : "--");
  document.getElementById("apiRecommendedList").innerHTML = recommended.length
    ? recommended
        .map(
          (item) => `
            <div class="api-link-row">
              <span>${escapeHtml(item.path)}</span>
              <strong>${escapeHtml(item.description)}</strong>
            </div>
          `
        )
        .join("")
    : '<div class="api-empty-row">暂无推荐入口</div>';
  document.getElementById("apiGroupList").innerHTML = groups.length
    ? groups
        .map(
          (group) => `
            <div class="api-group-row">
              <span>${escapeHtml(group.name)}</span>
              <strong>${integerText((group.endpoints || []).length)} 个</strong>
              <em>${escapeHtml(group.description || "")}</em>
            </div>
          `
        )
        .join("")
    : '<div class="api-empty-row">暂无接口分组</div>';
  setText(
    "apiCatalogConclusion",
    safetyOk
      ? "GET /api 已统一输出接口目录；当前系统接口保持只读、模拟、无真实交易边界。"
      : "接口目录已开放，但系统边界需要复核。"
  );
}

function setResultsPanel(results) {
  const risk = results.risk || {};
  const decision = risk.decision || {};
  const portfolio = (results.portfolio || {}).allocation || {};
  const route = (results.strategy_route || {}).route || {};
  const execution = (results.execution || {}).simulation || {};
  const metaEdge = results.meta_edge || {};
  const styleRotation = results.style_rotation || {};
  const styleFactor = styleRotation.style_factor || {};
  const etfUniverse = styleRotation.etf_universe || {};
  const styleInterpretation = styleRotation.interpretation || {};
  const etfRotation = results.etf_rotation_signal || {};
  const rotationConfidence = etfRotation.confidence || {};
  const etfBacktest = results.etf_rotation_backtest || {};
  const backtestSummary = etfBacktest.summary || {};
  const backtestValidation = etfBacktest.validation || {};
  const macroStyleBacktest = results.macro_style_etf_backtest || {};
  const macroStyleSummary = macroStyleBacktest.summary || {};
  const macroStyleValidation = macroStyleBacktest.validation || {};
  const shadowBacktest = results.shadow_backtest || {};
  const shadowSummary = shadowBacktest.summary || {};
  const shadowMetadata = shadowBacktest.metadata || {};
  const regimeAttribution = results.regime_attribution || {};
  const attributionSummary = regimeAttribution.summary || {};
  const regimePerformance = regimeAttribution.regime_performance || {};
  const alphaDecomposition = regimeAttribution.alpha_decomposition || {};
  const system = results.system || {};
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

  setText("systemStatus", system.status === "stable" ? "稳定" : "需复核");
  setText("systemLayers", integerText(system.layers));
  setText("systemExecutionMode", system.execution_mode === "simulation" ? "模拟层" : system.execution_mode || "--");
  setText("systemPolicyLocked", system.policy_locked ? "已锁定" : "未锁定");
  document.getElementById("systemBoundaryList").innerHTML = Object.entries(system.boundaries || {})
    .map(
      ([key, passed]) => `
        <div class="boundary-row">
          <span>${boundaryLabel(key)}</span>
          <strong>${passed ? "通过" : "需检查"}</strong>
        </div>
      `
    )
    .join("");
  setText(
    "systemConclusion",
    system.status === "stable"
      ? "FINAL 已冻结为 5 层机构级决策模拟系统，所有边界保持只读与模拟。"
      : "系统冻结条件未完全满足，请运行完整性检查。"
  );

  const activeMetaSignals = metaEdge.signals || [];
  const metaSignalStrengths = metaEdge.signal_strengths || {};
  setText("metaEdgeScore", percentText(metaEdge.meta_edge_score));
  setText("metaEdgeLevel", metaEdgeLevelLabel(metaEdge.meta_edge_level));
  document.getElementById("metaEdgeLevel").className = `meta-edge-level meta-${metaEdge.meta_edge_level || "quiet"}`;
  setText("metaEdgeActiveCount", activeMetaSignals.length ? `${integerText(activeMetaSignals.length)} 个` : "无触发");
  document.getElementById("metaEdgeSignalList").innerHTML = activeMetaSignals.length
    ? activeMetaSignals.map((signal) => `<span>${metaSignalLabel(signal)}</span>`).join("")
    : "<em>当前无显著矛盾信号</em>";
  document.getElementById("metaEdgeStrengthList").innerHTML = Object.entries(metaSignalStrengths)
    .map(
      ([signal, strength]) => `
        <div class="meta-strength-row">
          <span>${metaSignalLabel(signal)}</span>
          <strong>${percentText(strength)}</strong>
          <i style="width:${typeof strength === "number" ? Math.round(strength * 100) : 0}%"></i>
        </div>
      `
    )
    .join("");
  setText(
    "metaEdgeConclusion",
    metaEdge.meta_edge_level
      ? `${metaEdgeInterpretationText(metaEdge)}；该层只检测系统内部矛盾，不预测收益、不选股、不下单。`
      : "M1.1 只检测系统内部矛盾，不改变既有风控链路。"
  );

  const topStyles = styleFactor.top_styles || [];
  const topStyle = topStyles[0] || {};
  const topCandidate = styleInterpretation.primary_candidate || (etfUniverse.top_candidates || [])[0] || {};
  setText("styleRegime", regimeLabel(styleFactor.regime));
  setText(
    "styleTopStyle",
    topStyle.style ? `${styleLabel(topStyle.style)} ${percentText(topStyle.score)}` : "--"
  );
  setText(
    "styleTopCandidate",
    topCandidate.code ? `${topCandidate.name} · ${topCandidate.code}` : "--"
  );
  document.getElementById("styleScoreList").innerHTML = Object.entries(styleFactor.style_scores || {})
    .map(
      ([style, score]) => `
        <div class="style-score-row">
          <span>${styleLabel(style)}</span>
          <strong>${percentText(score)}</strong>
          <i style="width:${typeof score === "number" ? Math.round(score * 100) : 0}%"></i>
        </div>
      `
    )
    .join("");
  document.getElementById("styleCandidateList").innerHTML = (etfUniverse.top_candidates || [])
    .slice(0, 4)
    .map(
      (candidate) => `
        <div class="style-candidate-row">
          <span>${escapeHtml(candidate.name || "--")}</span>
          <strong>${escapeHtml(candidate.code || "--")}</strong>
          <em>${styleLabel(candidate.primary_style)} · ${percentText(candidate.candidate_score)}</em>
        </div>
      `
    )
    .join("");
  setText(
    "styleConclusion",
    styleFactor.engine
      ? `${styleInterpretation.summary || "A1.1 已把当前状态映射为风格评分与 ETF 候选池。"} 当前候选数 ${integerText(etfUniverse.candidate_count)}，仅生成 universe，不选股、不下单。`
      : "A1.1 风格轮动基础结果尚未生成。"
  );

  const rotationTopCandidate = (etfRotation.top_candidates || [])[0] || {};
  setText("rotationSignal", rotationSignalLabel(etfRotation.rebalance_signal));
  setText(
    "rotationConfidence",
    `${percentText(rotationConfidence.score)} · ${confidenceLevelLabel(rotationConfidence.level)}`
  );
  setText(
    "rotationTopEtf",
    rotationTopCandidate.code ? `${rotationTopCandidate.name} · ${rotationTopCandidate.code}` : "--"
  );
  const targetWeights = etfRotation.etf_target_weights || {};
  document.getElementById("rotationTargetWeights").innerHTML = Object.entries(targetWeights)
    .map(
      ([code, weight]) => `
        <div class="rotation-weight-row">
          <span>${escapeHtml(code)}</span>
          <strong>${percentText(weight)}</strong>
          <i style="width:${typeof weight === "number" ? Math.round(weight * 100) : 0}%"></i>
        </div>
      `
    )
    .join("");
  document.getElementById("rotationCandidateList").innerHTML = (etfRotation.top_candidates || [])
    .slice(0, 4)
    .map(
      (candidate) => `
        <div class="rotation-candidate-row">
          <span>${escapeHtml(candidate.name || "--")}</span>
          <strong>${percentText(candidate.signal_score)}</strong>
          <em>${escapeHtml(candidate.code || "--")} · ${styleLabel(candidate.primary_style)} · 相对强弱 ${percentText(candidate.relative_strength_score)}</em>
        </div>
      `
    )
    .join("");
  setText(
    "rotationConclusion",
    etfRotation.engine
      ? `A1.2 输出 ${rotationSignalLabel(etfRotation.rebalance_signal)}，${rotationConfidence.reason || "置信度待评估"} 该层只给 ETF 级模拟权重建议，不选股、不下单、不生成订单。`
      : "A1.2 ETF 轮动信号结果尚未生成。"
  );

  setText("backtestAlpha510500", signedRatioText(backtestSummary.alpha_vs_510500));
  setText("backtestAlphaEqual", signedRatioText(backtestSummary.alpha_vs_equal_weight));
  setText("backtestRotationReturn", signedRatioText(backtestSummary.rotation_total_return));
  setText("backtestBenchmark510500Return", signedRatioText(backtestSummary.benchmark_510500_return));
  setText("backtestEqualReturn", signedRatioText(backtestSummary.equal_weight_basket_return));
  setText("backtestSharpe", fixedText(backtestSummary.sharpe, 2));
  setText("backtestSessions", integerText(backtestSummary.sessions));
  setText("backtestRebalanceCount", integerText(backtestSummary.rebalance_count));
  setEtfBacktestComparisonTable(backtestSummary);
  setText(
    "backtestDrawdown",
    `轮动 ${percentText(backtestSummary.max_drawdown)} / 等权 ${percentText(backtestSummary.equal_weight_basket_max_drawdown)}`
  );
  setText("backtestHitRate", percentText(backtestSummary.hit_rate_vs_510500));
  const alphaVerdict = backtestValidation.alpha_positive_vs_equal_weight
    ? "跑赢 510500、510300 和等权 ETF basket，存在初步 alpha 证据"
    : backtestValidation.alpha_positive_vs_510500
      ? "仅小幅跑赢 510500，但未跑赢等权 ETF basket，alpha 证据不足"
      : "未跑赢 510500，当前轮动信号未证明 alpha";
  setText(
    "backtestConclusion",
    etfBacktest.metadata
      ? `A1.3 覆盖 ${integerText(backtestSummary.sessions)} 个交易日，${alphaVerdict}；收益口径优先采用 Tushare pct_chg/pre_close，避免 ETF 价格断点被误算为收益。`
      : "A1.3 ETF 轮动回测结果尚未生成。"
  );

  setText("macroStyleAlpha510500", signedRatioText(macroStyleSummary.alpha_vs_510500));
  setText("macroStyleAlphaEqual", signedRatioText(macroStyleSummary.alpha_vs_equal_weight));
  setText("macroStyleReturn", signedRatioText(macroStyleSummary.hierarchical_total_return));
  setText("macroStyle510500Return", signedRatioText(macroStyleSummary.benchmark_510500_return));
  setText("macroStyleEqualReturn", signedRatioText(macroStyleSummary.equal_weight_basket_return));
  setText("macroStyleSharpe", fixedText(macroStyleSummary.sharpe, 2));
  setText("macroStyleSessions", integerText(macroStyleSummary.sessions));
  setText("macroStyleRebalance", integerText(macroStyleSummary.rebalance_count));
  setMacroStyleComparisonTable(macroStyleSummary);
  setText(
    "macroStyleDrawdown",
    `分层 ${percentText(macroStyleSummary.max_drawdown)} / A1 ${percentText(macroStyleSummary.current_a1_max_drawdown)}`
  );
  setText("macroStyleHitRate", percentText(macroStyleSummary.hit_rate_vs_510500));
  const macroStyleVerdict = macroStyleValidation.alpha_positive_vs_equal_weight
    ? "分层组合跑赢等权 ETF basket，具备继续验证价值"
    : macroStyleValidation.alpha_positive_vs_current_a1
      ? "分层组合优于当前 A1，但仍未跑赢 510500 和等权 ETF basket"
      : "分层组合未优于当前 A1，暂未证明新增 alpha";
  setText(
    "macroStyleConclusion",
    macroStyleBacktest.metadata
      ? `M2.1 覆盖 ${integerText(macroStyleSummary.sessions)} 个交易日，平均权益仓位 ${percentText(macroStyleSummary.average_target_exposure)}；${macroStyleVerdict}。宏观层只管仓位，风格层只管权重，ETF 层只做映射。`
      : "M2.1 Macro-Style-ETF 分层回测结果尚未生成。"
  );

  setText("shadowFinalAlpha", signedRatioText(shadowSummary.final_alpha));
  setText("shadowAverageExposure", percentText(shadowSummary.average_applied_exposure));
  setText("shadowTotalReturn", signedRatioText(shadowSummary.shadow_total_return));
  setText("benchmarkTotalReturn", signedRatioText(shadowSummary.benchmark_total_return));
  setText("shadowFinalEquity", fixedText(shadowSummary.final_shadow_equity, 3));
  setText("benchmarkFinalEquity", fixedText(shadowSummary.final_benchmark_equity, 3));
  setText("shadowSessions", integerText(shadowSummary.sessions));
  setText("shadowBenchmarkCode", shadowSummary.benchmark_code || "--");
  setText(
    "shadowDrawdown",
    `${percentText(shadowSummary.max_drawdown_shadow)} / 基准 ${percentText(shadowSummary.max_drawdown_benchmark)}`
  );
  setText(
    "shadowConclusion",
    shadowSummary.sessions
      ? `S1.1 覆盖 ${integerText(shadowSummary.sessions)} 个交易日，使用 ${shadowSummary.benchmark_code || "510500.SH"} 作为基准，并按 ${integerText(shadowMetadata.execution_lag_sessions || 0)} 个交易日滞后应用 R2 仓位；这是仓位风控回测，不做选股，也不代表真实交易账户。收益口径同样优先采用 Tushare pct_chg/pre_close。`
      : "S1.1 仓位风控回测结果尚未生成。"
  );

  setText("regimeAttributionTotalAlpha", signedRatioText(attributionSummary.total_alpha));
  setText("regimeAttributionDrawdownReduction", percentText(attributionSummary.drawdown_reduction));
  setText("largestDragRegime", regimeLabel(attributionSummary.largest_drag_regime));
  setText("largestPositiveRegime", regimeLabel(attributionSummary.largest_positive_regime));
  const regimeOrder = ["bull", "range", "bear", "transition"];
  document.getElementById("regimeAttributionList").innerHTML = regimeOrder
    .filter((regime) => regimePerformance[regime])
    .map((regime) => {
      const item = regimePerformance[regime];
      return `
        <div class="attribution-regime-row">
          <span>${regimeLabel(regime)}</span>
          <strong>${signedRatioText(item.alpha)}</strong>
          <em>策略 ${signedRatioText(item.shadow_return)} / 基准 ${signedRatioText(item.benchmark_return)}</em>
        </div>
      `;
    })
    .join("");
  document.getElementById("alphaSourceList").innerHTML = Object.entries(alphaDecomposition.sources || {})
    .map(
      ([source, value]) => `
        <div class="alpha-source-row">
          <span>${alphaSourceLabel(source)}</span>
          <strong>${signedRatioText(value)}</strong>
        </div>
      `
    )
    .join("");
  setText(
    "regimeAttributionConclusion",
    attributionSummary.sessions
      ? `S1.2 显示主要拖累来自${regimeLabel(attributionSummary.largest_drag_regime)}，主要正贡献来自${regimeLabel(attributionSummary.largest_positive_regime)}；系统更像风险保护层，而不是原始收益 Alpha 生成器。`
      : "S1.2 regime 归因结果尚未生成。"
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
  const confidence = forecast.confidence || {};
  const levels = forecast.key_levels || {};
  const explanation = forecast.explanation || {};
  document.getElementById("trackRange").textContent =
    `${toIsoDate(track.cycle.start_date)} 至 ${toIsoDate(track.as_of)}`;
  document.getElementById("forecastHorizon").textContent = forecast.basis_horizon_sessions || "--";
  document.getElementById("forecastSample").textContent = forecast.sample_size ? `样本 ${forecast.sample_size}` : "样本不足";
  setText("forecastConfidence", percentText(confidence.score));
  setText("forecastConfidenceLabel", confidence.level_label || "--");
  document.getElementById("forecastConfidenceLabel").className = `confidence-level confidence-${confidence.level || "insufficient"}`;
  setText("forecastConfidenceReason", confidence.reason || "样本不足，暂不输出展望置信度。");
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
    const [current, cycle, results] = await Promise.all([
      getJson("/api/regime/current"),
      getJson("/api/regime/cycle"),
      getJson("/api/results/summary?compact=1"),
    ]);
    state.current = current;
    state.cycle = cycle;
    state.results = results;
    const phase = phaseFromMajorCycle(cycle);

    setRegimePanel(current);
    setScoreList(current.sub_scores);
    setCyclePanel(phase);
    setResultsPanel(results);
    if (document.getElementById("radarChart")) renderRadar("radarChart", current.sub_scores);
    if (document.getElementById("shadowEquityChart")) renderShadowEquityChart("shadowEquityChart", results.shadow_backtest || {});
    if (document.getElementById("rotationBacktestChart")) renderEtfRotationBacktestChart("rotationBacktestChart", results.etf_rotation_backtest || {});
    if (document.getElementById("macroStyleEtfChart")) renderMacroStyleEtfBacktestChart("macroStyleEtfChart", results.macro_style_etf_backtest || {});
  } finally {
    button.disabled = false;
    button.textContent = "刷新";
  }
}

document.getElementById("refreshButton").addEventListener("click", loadDashboard);
document.getElementById("rotationBacktestReset")?.addEventListener("click", () => {
  resetEtfRotationBacktestChart("rotationBacktestChart");
});
document.getElementById("macroStyleReset")?.addEventListener("click", () => {
  resetEtfRotationBacktestChart("macroStyleEtfChart");
});
loadDashboard();
