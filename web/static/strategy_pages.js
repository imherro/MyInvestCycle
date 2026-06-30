async function strategyGetJson(url) {
  const requestUrl = new URL(url, window.location.origin);
  requestUrl.searchParams.set("_t", Date.now().toString());
  const response = await fetch(requestUrl.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function strategySetText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function strategyPercentText(value) {
  if (typeof value !== "number") return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function strategySignedRatioText(value) {
  if (typeof value !== "number") return "--";
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

function strategyFixedText(value, digits = 2) {
  if (typeof value !== "number") return "--";
  return value.toFixed(digits);
}

function strategyIntegerText(value) {
  if (typeof value !== "number") return "--";
  return value.toLocaleString("zh-CN");
}

function strategyScoreText(value) {
  if (typeof value !== "number") return "--";
  return value.toFixed(3);
}

function strategyDrawdownReductionText(value) {
  if (typeof value !== "number") return "--";
  const percent = Math.abs(value * 100).toFixed(1);
  if (value > 0) return `策略少 ${percent}pct`;
  if (value < 0) return `策略多 ${percent}pct`;
  return "持平";
}

function strategyToIsoDate(value) {
  if (!value || String(value).length !== 8) return value || "--";
  const text = String(value);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function strategyEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function strategyStyleLabel(value) {
  const labels = {
    growth: "成长/科技",
    value: "价值/大盘",
    small_cap: "中小盘",
    dividend: "红利/低波",
    low_vol: "红利/低波",
    cash_proxy: "现金/债券代理",
  };
  return labels[value] || value || "--";
}

function strategyRegimeLabel(value) {
  const labels = {
    bull: "牛市",
    bear: "熊市",
    range: "震荡",
    transition: "过渡",
    recovery: "修复",
    contraction: "收缩",
  };
  return labels[value] || value || "--";
}

function strategyRotationSignalLabel(value) {
  if (!value) return "--";
  if (value === "hold_universe") return "保持观察池";
  if (value === "insufficient_data") return "样本不足";
  if (value.startsWith("rotate_to_")) return `转向${strategyStyleLabel(value.replace("rotate_to_", ""))}`;
  return value;
}

function strategyConfidenceLevelLabel(value) {
  const labels = {
    high: "高",
    medium: "中",
    medium_low: "中低",
    low: "低",
    insufficient: "样本不足",
  };
  return labels[value] || value || "--";
}

const STRATEGY_ETF_ORDER = [
  { code: "159915.SZ", style: "成长/科技", name: "创业板ETF" },
  { code: "510500.SH", style: "中小盘", name: "中证500ETF" },
  { code: "510300.SH", style: "价值/大盘", name: "沪深300ETF" },
  { code: "510880.SH", style: "红利/低波", name: "红利ETF" },
  { code: "511880.SH", style: "现金/债券代理", name: "银华日利ETF" },
];

function strategySetSummaryTiles(items) {
  const target = document.getElementById("summaryTiles");
  if (!target) return;
  target.innerHTML = items
    .map(
      (item) => `
        <div class="summary-tile">
          <span>${strategyEscapeHtml(item.label)}</span>
          <strong>${strategyEscapeHtml(item.value)}</strong>
        </div>
      `
    )
    .join("");
}

function strategyWeightsRowsHtml(weights) {
  const weightMap = weights || {};
  return STRATEGY_ETF_ORDER.map((asset) => {
    const weight = Number(weightMap[asset.code] || 0);
    return `
      <div class="rotation-weight-row">
        <span>${strategyEscapeHtml(asset.style)} · ${strategyEscapeHtml(asset.code)} ${strategyEscapeHtml(asset.name)}</span>
        <strong>${strategyPercentText(weight)}</strong>
        <i style="width:${Math.round(weight * 100)}%"></i>
      </div>
    `;
  }).join("");
}

function strategyTopCandidatesHtml(candidates) {
  return (candidates || [])
    .slice(0, 5)
    .map(
      (candidate) => `
        <div class="rotation-candidate-row">
          <span>${strategyEscapeHtml(candidate.name || "--")}</span>
          <strong>${strategyScoreText(candidate.signal_score)}</strong>
          <em>${strategyEscapeHtml(candidate.code || "--")} · ${strategyStyleLabel(candidate.primary_style)} · 相对强弱 ${strategyScoreText(candidate.relative_strength_score)}</em>
        </div>
      `
    )
    .join("");
}

function strategyBacktestComparisonTable(targetId, rows) {
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
            <strong>${strategyEscapeHtml(item.label || item.code || "--")}</strong>
            <span>${strategySignedRatioText(item.total_return)}</span>
            <span>${strategyPercentText(item.max_drawdown)}</span>
            <span>${item.isStrategy ? "--" : strategySignedRatioText(item.return_advantage)}</span>
            <span>${item.isStrategy ? "--" : strategyDrawdownReductionText(item.drawdown_reduction)}</span>
          </div>
        `
      )
      .join("")}
  `;
}

function strategySetEtfComparison(summary) {
  const comparisonEtfs = (summary.comparison_etfs || []).map((item) => ({
    ...item,
    return_advantage: item.rotation_return_advantage,
    drawdown_reduction: item.rotation_drawdown_reduction,
  }));
  strategyBacktestComparisonTable("backtestEtfComparison", [
    {
      label: "轮动策略",
      total_return: summary.rotation_total_return,
      max_drawdown: summary.max_drawdown,
      isStrategy: true,
    },
    ...comparisonEtfs,
  ]);
}

function strategySetMacroComparison(summary) {
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
  strategyBacktestComparisonTable("macroStyleComparison", [
    {
      label: "M2.1 分层组合",
      total_return: strategyReturn,
      max_drawdown: strategyDrawdown,
      isStrategy: true,
    },
    ...comparisonRows,
  ]);
}

function strategySetRotationSignal(signal) {
  const confidence = signal.confidence || {};
  const topCandidate = (signal.top_candidates || [])[0] || {};
  strategySetText("rotationSignal", strategyRotationSignalLabel(signal.rebalance_signal));
  strategySetText(
    "rotationConfidence",
    `${strategyPercentText(confidence.score)} · ${strategyConfidenceLevelLabel(confidence.level)}`
  );
  strategySetText(
    "rotationTopEtf",
    topCandidate.code ? `${topCandidate.name} · ${topCandidate.code}` : "--"
  );
  const weightsTarget = document.getElementById("rotationTargetWeights");
  if (weightsTarget) weightsTarget.innerHTML = strategyWeightsRowsHtml(signal.etf_target_weights || {});
  const candidatesTarget = document.getElementById("rotationCandidateList");
  if (candidatesTarget) candidatesTarget.innerHTML = strategyTopCandidatesHtml(signal.top_candidates || []);
  strategySetText(
    "rotationConclusion",
    signal.engine
      ? `A1.2 输出 ${strategyRotationSignalLabel(signal.rebalance_signal)}，${confidence.reason || "置信度待评估"} 该层只给 ETF 级模拟权重建议，不选股、不下单、不生成订单。`
      : "A1.2 ETF 轮动信号结果尚未生成。"
  );
}

function strategySetEtfBacktest(backtest) {
  const summary = backtest.summary || {};
  const validation = backtest.validation || {};
  strategySetText("backtestAlpha510500", strategySignedRatioText(summary.alpha_vs_510500));
  strategySetText("backtestAlphaEqual", strategySignedRatioText(summary.alpha_vs_equal_weight));
  strategySetText("backtestRotationReturn", strategySignedRatioText(summary.rotation_total_return));
  strategySetText("backtestBenchmark510500Return", strategySignedRatioText(summary.benchmark_510500_return));
  strategySetText("backtestEqualReturn", strategySignedRatioText(summary.equal_weight_basket_return));
  strategySetText("backtestSharpe", strategyFixedText(summary.sharpe, 2));
  strategySetText("backtestSessions", strategyIntegerText(summary.sessions));
  strategySetText("backtestRebalanceCount", strategyIntegerText(summary.rebalance_count));
  strategySetEtfComparison(summary);
  strategySetText(
    "backtestDrawdown",
    `轮动 ${strategyPercentText(summary.max_drawdown)} / 等权 ${strategyPercentText(summary.equal_weight_basket_max_drawdown)}`
  );
  strategySetText("backtestHitRate", strategyPercentText(summary.hit_rate_vs_510500));
  const alphaVerdict = validation.alpha_positive_vs_equal_weight
    ? "跑赢 510500、510300 和等权 ETF basket，存在初步 alpha 证据"
    : validation.alpha_positive_vs_510500
      ? "仅小幅跑赢 510500，但未跑赢等权 ETF basket，alpha 证据不足"
      : "未跑赢 510500，当前轮动信号未证明 alpha";
  strategySetText(
    "backtestConclusion",
    backtest.metadata
      ? `A1.3 覆盖 ${strategyIntegerText(summary.sessions)} 个交易日，${alphaVerdict}；收益口径优先采用 Tushare pct_chg/pre_close，避免 ETF 价格断点被误算为收益。`
      : "A1.3 ETF 轮动回测结果尚未生成。"
  );
}

function strategyTopWeightText(weights, labelFn, limit = 3) {
  return Object.entries(weights || {})
    .map(([key, value]) => [key, Number(value) || 0])
    .filter((entry) => entry[1] > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key, value]) => `${labelFn(key)} ${strategyPercentText(value)}`)
    .join(" / ") || "--";
}

function strategyCombinedStyleWeights(weights) {
  return {
    growth: Number((weights || {}).growth || 0),
    small_cap: Number((weights || {}).small_cap || 0),
    value: Number((weights || {}).value || 0),
    dividend_low_vol: Number((weights || {}).dividend || 0) + Number((weights || {}).low_vol || 0),
  };
}

function strategyCombinedStyleLabel(value) {
  const labels = {
    growth: "成长/科技",
    small_cap: "中小盘",
    value: "价值/大盘",
    dividend_low_vol: "红利/低波",
  };
  return labels[value] || strategyStyleLabel(value);
}

function strategySetMacroLatestSignal(signals) {
  const latest = (signals || [])[signals.length - 1] || {};
  const styleWeights = strategyCombinedStyleWeights(latest.style_allocation || {});
  strategySetText(
    "macroLatestRegime",
    latest.date ? `${strategyToIsoDate(latest.date)} · ${strategyRegimeLabel(latest.macro_regime)}` : "--"
  );
  strategySetText("macroLatestExposure", strategyPercentText(latest.target_exposure));
  strategySetText("macroLatestStyle", strategyTopWeightText(styleWeights, strategyCombinedStyleLabel, 3));
  strategySetText("macroLatestEtf", strategyTopWeightText(latest.etf_allocation || {}, (code) => code, 3));
  strategySetText("macroLatestTurnover", strategyPercentText(latest.turnover_to_target));
  strategySetText(
    "macroLatestReason",
    latest.date
      ? `最近一次信号按 ${strategyRegimeLabel(latest.macro_regime)} 宏观状态计算权益上限，再把权益部分分配到风格 ETF；现金/债券代理在 511880 中体现。`
      : "暂无分层信号。"
  );
}

function strategySetMacroBacktest(backtest) {
  const summary = backtest.summary || {};
  const validation = backtest.validation || {};
  strategySetText("macroStyleAlpha510500", strategySignedRatioText(summary.alpha_vs_510500));
  strategySetText("macroStyleAlphaEqual", strategySignedRatioText(summary.alpha_vs_equal_weight));
  strategySetText("macroStyleReturn", strategySignedRatioText(summary.hierarchical_total_return));
  strategySetText("macroStyle510500Return", strategySignedRatioText(summary.benchmark_510500_return));
  strategySetText("macroStyleEqualReturn", strategySignedRatioText(summary.equal_weight_basket_return));
  strategySetText("macroStyleSharpe", strategyFixedText(summary.sharpe, 2));
  strategySetText("macroStyleSessions", strategyIntegerText(summary.sessions));
  strategySetText("macroStyleRebalance", strategyIntegerText(summary.rebalance_count));
  strategySetMacroComparison(summary);
  strategySetText(
    "macroStyleDrawdown",
    `分层 ${strategyPercentText(summary.max_drawdown)} / A1 ${strategyPercentText(summary.current_a1_max_drawdown)}`
  );
  strategySetText("macroStyleHitRate", strategyPercentText(summary.hit_rate_vs_510500));
  const verdict = validation.alpha_positive_vs_equal_weight
    ? "分层组合跑赢等权 ETF basket，具备继续验证价值"
    : validation.alpha_positive_vs_current_a1
      ? "分层组合优于当前 A1，但仍未跑赢 510500 和等权 ETF basket"
      : "分层组合未优于当前 A1，暂未证明新增 alpha";
  strategySetText(
    "macroStyleConclusion",
    backtest.metadata
      ? `M2.1 覆盖 ${strategyIntegerText(summary.sessions)} 个交易日，平均权益仓位 ${strategyPercentText(summary.average_target_exposure)}；${verdict}。宏观层只管仓位，风格层只管权重，ETF 层只做映射。`
      : "M2.1 Macro-Style-ETF 分层回测结果尚未生成。"
  );
}

function strategyGenericWeightRows(weights, universe) {
  const assets = universe || [];
  const byCode = new Map(assets.map((asset) => [asset.code, asset]));
  const rows = Object.entries(weights || {})
    .map(([code, weight]) => ({
      code,
      weight: Number(weight) || 0,
      asset: byCode.get(code) || { code, name: code, group: "资产" },
    }))
    .sort((left, right) => right.weight - left.weight);
  if (!rows.length) return '<div class="generic-empty">暂无目标仓位</div>';
  return rows
    .map(
      (row) => `
        <div class="rotation-weight-row">
          <span>${strategyEscapeHtml(row.asset.group)} · ${strategyEscapeHtml(row.code)} ${strategyEscapeHtml(row.asset.name)}</span>
          <strong>${strategyPercentText(row.weight)}</strong>
          <i style="width:${Math.round(row.weight * 100)}%"></i>
        </div>
      `
    )
    .join("");
}

function strategyGenericWeightPills(weights, universe) {
  const byCode = new Map((universe || []).map((asset) => [asset.code, asset]));
  return `<div class="weight-pill-list">${Object.entries(weights || {})
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
    .map(([code, weight]) => {
      const asset = byCode.get(code) || { name: code, group: "资产" };
      return `<span>${strategyEscapeHtml(asset.group)} ${strategyEscapeHtml(code)} ${strategyPercentText(Number(weight) || 0)}</span>`;
    })
    .join("")}</div>`;
}

function strategyGenericCandidateText(candidates) {
  return (candidates || [])
    .slice(0, 4)
    .map((item) => `${item.code} ${strategyScoreText(item.score)}`)
    .join(" / ") || "--";
}

function strategySetGenericComparison(summary) {
  strategyBacktestComparisonTable("genericComparison", [
    {
      label: summary.short_name || "策略组合",
      total_return: summary.strategy_total_return,
      max_drawdown: summary.max_drawdown,
      isStrategy: true,
    },
    ...(summary.comparison_assets || []),
  ]);
}

function strategySignalLabel(value) {
  const labels = {
    defensive_cash: "防守现金",
    single_defensive_asset: "单防守资产+现金",
    dividend_low_vol_mix: "红利低波组合",
    cash_empty_position: "511880 空仓",
    industry_top3_momentum: "行业 Top3 动量",
    all_assets_cash: "四资产现金",
    single_asset_plus_cash: "单资产+现金",
    top2_four_asset: "四资产 Top2",
    drawdown_cash_wait: "回撤未到档",
    drawdown_ladder_buy: "回撤分批买入",
    all_weather_rebalance: "全天候再平衡",
    reversion_full_buy: "回归满仓",
    reversion_buy: "回归加仓",
    reversion_mild_buy: "轻度加仓",
    reversion_neutral: "中性仓位",
    reversion_reduce: "高位降仓",
    reversion_light: "极高位轻仓",
    reversion_guard_cap: "下行限仓",
    fcf_channel_half_reduce: "上轨半仓",
    fcf_channel_full_exit: "上轨空仓",
    fcf_channel_full_buy: "下轨满仓",
    fcf_channel_hold: "通道内持有",
  };
  return labels[value] || value || "--";
}

function strategySetGenericPage(backtest) {
  const metadata = backtest.metadata || {};
  const summary = backtest.summary || {};
  const performance = backtest.performance_metrics || {};
  const validation = backtest.validation || {};
  const universe = metadata.universe || [];
  const signals = backtest.signals || [];
  const latestSignal = signals[signals.length - 1] || {};
  const isIndexStrategy = metadata.indicator === "free_cash_flow_trend_channel";
  const comparisonLabel = summary.equal_weight_label || "等权";
  const annualizedReturn =
    typeof summary.annualized_return === "number" ? summary.annualized_return : performance.annualized_return;

  document.title = summary.strategy_name || "策略回测";
  strategySetText("genericEyebrow", summary.strategy_id || "Strategy");
  strategySetText("genericTitle", summary.strategy_name || "策略回测");
  strategySetText("genericDescription", metadata.description || "--");
  strategySetText("genericRange", `${strategyToIsoDate(summary.start_date)} - ${strategyToIsoDate(summary.end_date)}`);
  const genericTiles = [
    { label: "回测区间", value: `${strategyToIsoDate(summary.start_date)} - ${strategyToIsoDate(summary.end_date)}` },
    { label: "策略收益", value: strategySignedRatioText(summary.strategy_total_return) },
    { label: "年化收益", value: strategySignedRatioText(annualizedReturn) },
    { label: "最大回撤", value: strategyPercentText(summary.max_drawdown) },
    { label: `Alpha vs ${comparisonLabel}`, value: strategySignedRatioText(summary.alpha_vs_equal_weight) },
    ...(isIndexStrategy
      ? [{ label: "最新轨道位置", value: strategyFixedText(summary.latest_channel_position, 2) }]
      : []),
    { label: "夏普", value: strategyFixedText(summary.sharpe, 2) },
    { label: "调仓次数", value: strategyIntegerText(summary.rebalance_count) },
  ];
  strategySetSummaryTiles(genericTiles);
  const methodTarget = document.getElementById("genericMethodList");
  if (methodTarget) {
    methodTarget.innerHTML = (metadata.method || [])
      .map((item, index) => `<div><span>规则 ${index + 1}</span><strong>${strategyEscapeHtml(item)}</strong></div>`)
      .join("");
  }
  strategySetText("genericLatestDate", latestSignal.date ? strategyToIsoDate(latestSignal.date) : "--");
  strategySetText("genericLatestSignal", strategySignalLabel(summary.latest_signal));
  strategySetText("genericRebalanceCount", strategyIntegerText(summary.rebalance_count));
  const latestWeightsTarget = document.getElementById("genericLatestWeights");
  if (latestWeightsTarget) latestWeightsTarget.innerHTML = strategyGenericWeightRows(summary.latest_weights || {}, universe);
  const latestReason = latestSignal.rebalance_reason || {};
  strategySetText("genericLatestReason", latestReason.detail || metadata.description || "--");
  strategySetText("genericStrategyReturn", strategySignedRatioText(summary.strategy_total_return));
  strategySetText("genericAnnualizedReturn", strategySignedRatioText(annualizedReturn));
  strategySetText("genericMaxDrawdown", strategyPercentText(summary.max_drawdown));
  strategySetText("genericAlphaEqual", strategySignedRatioText(summary.alpha_vs_equal_weight));
  strategySetText("genericSharpe", strategyFixedText(summary.sharpe, 2));
  strategySetText("genericHitRate", strategyPercentText(summary.hit_rate_vs_primary_benchmark));
  strategySetText("genericSessions", strategyIntegerText(summary.sessions));
  strategySetText("genericTurnover", strategyPercentText(summary.average_turnover));
  strategySetText("genericSignalSummary", strategySignalLabel(summary.latest_signal));
  strategySetGenericComparison(summary);
  const verdict = isIndexStrategy
    ? validation.alpha_positive_vs_equal_weight
      ? "本策略跑赢自由现金流指数基准，说明趋势通道择时存在初步收益改善。"
      : "本策略未跑赢自由现金流指数基准，当前更像风险暴露调节工具，需要继续优化趋势线规则。"
    : validation.mean_reversion_signal
    ? validation.alpha_positive_vs_equal_weight
      ? "本策略跑赢四 ETF 等权基准，说明当前均值回归规则有初步 alpha 证据。"
      : "本策略未跑赢四 ETF 等权基准，当前更像回撤控制工具，不是稳赚模型。"
    : validation.static_allocation
    ? "本策略是固定配置基准，重点观察收益、回撤和夏普之间的权衡，不以跑赢等权资产池作为唯一目标。"
    : validation.alpha_positive_vs_equal_weight
      ? "本策略跑赢等权资产池，具备继续优化和跟踪价值。"
      : "本策略未跑赢等权资产池，当前规则更适合保留为反例或继续优化。";
  strategySetText(
    "genericConclusion",
    `${summary.short_name || "策略"}覆盖 ${strategyIntegerText(summary.sessions)} 个交易日，${verdict} 收益口径使用${isIndexStrategy ? " Tushare index_daily 指数日收益；图中红/灰/绿线为 2016 低点以来的对数直线上轨、中轨、下轨。本版通道包含当前研究锚点，适合复盘观察，不等同于严格无未来函数实盘信号。" : " ETF fund_daily pct_chg/pre_close。"}`
  );
  const signalTarget = document.getElementById("genericSignalList");
  if (signalTarget) {
    signalTarget.innerHTML = [...signals]
      .reverse()
      .map((item) => {
        const reason = item.rebalance_reason || {};
        return `
          <article class="generic-signal-card">
            <div>
              <span>${strategyToIsoDate(item.date)}</span>
              <strong>${strategySignalLabel(item.strategy_signal)}</strong>
              <em>换手 ${strategyPercentText(item.turnover_to_target)} · Top ${strategyEscapeHtml(strategyGenericCandidateText(item.top_candidates))}</em>
            </div>
            ${strategyGenericWeightPills(item.target_weights || {}, universe)}
            <p>${strategyEscapeHtml(reason.detail || "")}</p>
          </article>
        `;
      })
      .join("");
  }
  strategySetText("genericHistoryCount", `${strategyIntegerText(signals.length)} 次再平衡记录`);
  renderStrategyBacktestChart("genericStrategyChart", backtest);
}

async function strategyRenderGenericPage() {
  const strategyId = window.location.pathname.split("/").filter(Boolean).pop();
  const backtest = await strategyGetJson(`/api/strategy-backtests/${strategyId}`);
  strategySetGenericPage(backtest);
}

async function strategyRenderEtfRotationPage() {
  const [signal, backtest] = await Promise.all([
    strategyGetJson("/api/style/rotation-signal"),
    strategyGetJson("/api/style/rotation-backtest"),
  ]);
  const summary = backtest.summary || {};
  strategySetSummaryTiles([
    { label: "回测区间", value: `${strategyToIsoDate(summary.start_date)} - ${strategyToIsoDate(summary.end_date)}` },
    { label: "轮动收益", value: strategySignedRatioText(summary.rotation_total_return) },
    { label: "年化收益", value: strategySignedRatioText(backtest.performance_metrics?.annualized_return) },
    { label: "最大回撤", value: strategyPercentText(summary.max_drawdown) },
    { label: "命中率", value: strategyPercentText(summary.hit_rate_vs_510500) },
    { label: "当前方向", value: strategyRotationSignalLabel(signal.rebalance_signal) },
    { label: "调仓次数", value: strategyIntegerText(summary.rebalance_count) },
  ]);
  strategySetRotationSignal(signal);
  strategySetEtfBacktest(backtest);
  renderEtfRotationBacktestChart("rotationBacktestChart", backtest);
}

async function strategyRenderMacroStylePage() {
  const backtest = await strategyGetJson("/api/style/macro-style-etf-backtest");
  const summary = backtest.summary || {};
  strategySetSummaryTiles([
    { label: "回测区间", value: `${strategyToIsoDate(summary.start_date)} - ${strategyToIsoDate(summary.end_date)}` },
    { label: "分层收益", value: strategySignedRatioText(summary.hierarchical_total_return) },
    { label: "年化收益", value: strategySignedRatioText(backtest.performance_metrics?.annualized_return) },
    { label: "最大回撤", value: strategyPercentText(summary.max_drawdown) },
    { label: "平均权益仓位", value: strategyPercentText(summary.average_target_exposure) },
    { label: "Alpha vs A1", value: strategySignedRatioText(summary.alpha_vs_current_a1) },
    { label: "调仓次数", value: strategyIntegerText(summary.rebalance_count) },
  ]);
  strategySetMacroLatestSignal(backtest.signals || []);
  strategySetMacroBacktest(backtest);
  renderMacroStyleEtfBacktestChart("macroStyleEtfChart", backtest);
}

async function strategyBootPage() {
  const page = document.body.dataset.page;
  if (page === "strategy-etf-rotation") await strategyRenderEtfRotationPage();
  if (page === "strategy-macro-style") await strategyRenderMacroStylePage();
  if (page === "strategy-generic") await strategyRenderGenericPage();
}

document.getElementById("rotationBacktestReset")?.addEventListener("click", () => {
  resetEtfRotationBacktestChart("rotationBacktestChart");
});
document.getElementById("macroStyleReset")?.addEventListener("click", () => {
  resetEtfRotationBacktestChart("macroStyleEtfChart");
});
document.getElementById("genericStrategyReset")?.addEventListener("click", () => {
  resetEtfRotationBacktestChart("genericStrategyChart");
});

strategyBootPage().catch((error) => {
  console.error(error);
  strategySetText("pageError", error.message || "页面加载失败");
});
