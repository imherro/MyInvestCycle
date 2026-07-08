const state = {
  current: null,
  cycle: null,
  scoreHistory: null,
  results: null,
};

function setRegimePanel(current) {
  const panel = document.getElementById("regimePanel");
  if (!panel) return;
  const color = REGIME_COLORS[current.regime] || REGIME_COLORS.range;
  panel.style.borderLeftColor = color;
  setText("regimeName", shortTermRegimeLabel(current.regime));
  const name = document.getElementById("regimeName");
  if (name) name.style.color = color;
  setText("asOf", `数据基准日 ${toIsoDate(current.as_of)}`);
  setText("dataAsOfValue", toIsoDate(current.as_of));
  setText("confidenceValue", scorePercent(current.confidence));
  setText("regimeScoreValue", scorePercent(current.regime_score));
}

function shortTermRegimeLabel(regime) {
  const labels = {
    bull: "短期强势",
    bear: "短期弱势",
    range: "短期震荡",
    transition: "短期分歧",
    recovery: "短期修复",
    contraction: "风险收缩",
  };
  return labels[regime] || regimeLabel(regime);
}

function setRegimeContextNote(current, cycle) {
  const currentLabel = shortTermRegimeLabel(current?.regime);
  const cycleState = cycle?.current_cycle?.state;
  const cycleLabel = cycleState ? `${regimeLabel(cycleState)}主周期` : "长期主周期";
  const drivers = [];
  if (typeof current?.trend_score === "number") drivers.push(`趋势 ${scorePercent(current.trend_score)}`);
  if (typeof current?.breadth_score === "number") drivers.push(`宽度 ${scorePercent(current.breadth_score)}`);
  const driverText = drivers.length ? `，当前主要证据是${drivers.join("、")}` : "";
  const asOfText = current?.as_of ? `数据基准日 ${toIsoDate(current.as_of)}。` : "";
  const note = `${asOfText}短期风控状态为“${currentLabel}”，只代表趋势、宽度、流动性、波动稳定性的短期温度${driverText}；长期判断仍按“${cycleLabel}”单独观察。`;
  setText("regimeContextNote", note);
  const help = document.getElementById("macroSummaryHelp");
  if (help) help.dataset.help = note;
}

function setScoreList(scores) {
  const target = document.getElementById("scoreList");
  if (!target) return;
  const labels = [
    ["trend", "趋势"],
    ["breadth", "宽度"],
    ["liquidity", "流动性"],
    ["volatility", "波动稳定"],
  ];
  target.innerHTML = labels
    .map(([key, label]) => `<div class="score-chip"><span>${label}</span><strong>${scorePercent(scores[key])}</strong></div>`)
    .join("");
}

function setScoreHistoryNote(history) {
  const items = history?.items || [];
  if (!items.length) {
    setText("scoreHistoryNote", "暂无可用历史评分。");
    return;
  }
  const historyEnd = history?.source?.history_end;
  const cacheText = historyEnd && historyEnd !== history.as_of ? `，历史缓存至 ${toIsoDate(historyEnd)}` : "";
  const latestText = history?.source?.appended_current ? `，最新点 ${toIsoDate(history.as_of)} 使用当前评分` : "";
  const filledCount = history?.source?.dynamic_tail_count || 0;
  const filledText = filledCount ? `，末尾 ${filledCount} 个交易日为现场补算` : "";
  setText(
    "scoreHistoryNote",
    `${toIsoDate(history.start_date)} 至 ${toIsoDate(history.as_of)} · ${items.length} 个绘图点 · 灰线为上证指数收盘价背景${cacheText}${latestText}${filledText}。`
  );
}

function mergeScoreHistoryCurrent(history, current) {
  if (!history || !current?.as_of) return history;
  const items = [...(history.items || [])];
  const hasCurrent = items.some((item) => item.as_of === current.as_of);
  if (!hasCurrent) {
    items.push({
      as_of: current.as_of,
      regime: current.regime,
      structural_regime: null,
      scores: {
        ...(current.sub_scores || {}),
        regime_score: current.regime_score,
        confidence: current.confidence,
      },
      index: {
        close: history.source?.latest_index?.as_of === current.as_of ? history.source.latest_index.close : null,
      },
    });
  }
  items.sort((left, right) => String(left.as_of).localeCompare(String(right.as_of)));
  return {
    ...history,
    as_of: current.as_of,
    items,
    source: {
      ...(history.source || {}),
      appended_current: !hasCurrent,
    },
  };
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
  const title = document.getElementById("cycleTitle");
  if (!title) return;
  const color = REGIME_COLORS[phase.regime] || REGIME_COLORS.range;
  title.textContent = `${regimeLabel(phase.regime)}主周期`;
  title.style.color = color;
  setText("cycleStart", `${toIsoDate(phase.startDate)} · 上证 ${phase.startClose}`);
  setText("cycleEnd", phase.endDate ? toIsoDate(phase.endDate) : "进行中");
  setText(
    "cyclePosition",
    `第 ${phase.elapsedSessions} 个交易日 · 约 ${phase.elapsedYears} 年 · ${phase.returnPct}%`
  );
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

function annualizedFromTotal(totalReturn, sessions) {
  if (typeof totalReturn !== "number" || typeof sessions !== "number" || sessions <= 0 || totalReturn <= -1) return null;
  return (1 + totalReturn) ** (252 / sessions) - 1;
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
  setText(id, percentText(value));
  const bar = document.getElementById(barId);
  if (bar) bar.style.width = typeof value === "number" ? `${Math.round(value * 100)}%` : "0";
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

function setHtml(id, value) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = value;
}

function setClassName(id, value) {
  const node = document.getElementById(id);
  if (node) node.className = value;
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

const STRATEGY_DIRECTORY_CARDS = [
  {
    id: "etf-rotation",
    title: "ETF 轮动回测",
    badge: "A1.3",
    href: "/strategy/etf-rotation",
    rule: "每 20 个交易日依据市场状态、风格分数、ETF 相对强弱和排名稳定性，在宽基、红利、成长与现金代理之间轮动；信号收盘后生成，下一交易日生效。",
    source: "etf_rotation_backtest",
    returnKey: "rotation_total_return",
    equalReturnKey: "equal_weight_basket_return",
    equalDrawdownKey: "equal_weight_basket_max_drawdown",
  },
  {
    id: "macro-style",
    title: "Macro-Style-ETF 分层回测",
    badge: "M2.1",
    href: "/strategy/macro-style",
    rule: "把规则拆成宏观层、风格层和 ETF 层：宏观层决定权益暴露范围，风格层分配成长、价值、小盘、红利低波，ETF 层只做执行映射。",
    source: "macro_style_etf_backtest",
    returnKey: "hierarchical_total_return",
    equalReturnKey: "equal_weight_basket_return",
    equalDrawdownKey: "equal_weight_basket_max_drawdown",
  },
  {
    id: "defensive-dividend",
    title: "红利低波防守",
    badge: "Defensive",
    href: "/strategy/defensive-dividend",
    rule: "在红利 ETF、红利低波 ETF 与 511880 现金代理之间切换；红利趋势不足时转向现金代理，目标是降低波动和控制回撤。",
  },
  {
    id: "industry-momentum",
    title: "行业 ETF 动量",
    badge: "Momentum",
    href: "/strategy/industry-momentum",
    rule: "在主要行业 ETF 中按 20/60/120 日动量、波动和回撤评分，选择中期趋势最强的行业；行业趋势不足时转入现金代理。",
  },
  {
    id: "four-asset",
    title: "四资产轮动",
    badge: "Four Asset",
    href: "/strategy/four-asset",
    rule: "在股票、债券、黄金、现金四类 ETF 间按趋势和风险调整评分选择，利用低相关资产改善组合波动和回撤。",
  },
  {
    id: "max-drawdown-batch",
    title: "回撤分批买入",
    badge: "Drawdown",
    href: "/strategy/max-drawdown-batch",
    rule: "用核心 ETF 自身历史回撤分布定义左侧买入档位，回撤加深时分批投入，回撤修复后逐级降低风险。",
  },
  {
    id: "all-weather",
    title: "全天候组合",
    badge: "All Weather",
    href: "/strategy/all-weather",
    rule: "用 A 股 ETF 近似经典全天候组合，覆盖股票、长久期国债、中期国债、黄金和商品期货篮子，并定期再平衡。",
  },
  {
    id: "equal-weight-reversion-basic",
    title: "等权回归基础",
    badge: "Mean Reversion",
    href: "/strategy/equal-weight-reversion-basic",
    rule: "构造 510300、510880、510500、159915 四 ETF 等权净值，观察其相对 MA250 的标准化偏离，低位提高权益暴露，高位降低。",
  },
  {
    id: "equal-weight-reversion-guarded",
    title: "等权回归风控",
    badge: "Guarded",
    href: "/strategy/equal-weight-reversion-guarded",
    rule: "在等权均线回归基础上增加 MA250 下行过滤，避免长期下行阶段越跌越加，优先控制回撤风险。",
  },
  {
    id: "free-cash-flow-trend-half",
    title: "自由现金流通道半仓",
    badge: "FCF Trend",
    href: "/strategy/free-cash-flow-trend-half",
    rule: "统一使用 480092.CNI 国证自由现金流R指数构造 2016 低点以来的对数直线通道；靠近上轨按 5pct 阶梯定卖，最低降到 50%，靠近下轨按 5pct 阶梯定投/加回。",
  },
  {
    id: "free-cash-flow-trend-full",
    title: "自由现金流通道空仓",
    badge: "FCF Trend",
    href: "/strategy/free-cash-flow-trend-full",
    rule: "统一使用 480092.CNI 国证自由现金流R指数对数直线通道；进入上轨卖出区间一次性降到 0%，进入下轨买入区间一次性恢复 100%。",
  },
  {
    id: "free-cash-flow-drawdown-rebound",
    title: "自由现金流回撤反弹",
    badge: "FCF Rebound",
    href: "/strategy/free-cash-flow-drawdown-rebound",
    rule: "空仓跟踪 480092.CNI 阶段高点，回撤 n% 后满仓买入；满仓跟踪阶段低点，反弹 n% 后空仓卖出；同时测试 10%、12%、15%、18%、20% 五个阈值。",
  },
  {
    id: "free-cash-flow-buy-hold-480092",
    title: "自由现金流R满仓",
    badge: "FCF Hold",
    href: "/strategy/free-cash-flow-buy-hold-480092",
    rule: "从 480092.CNI 国证自由现金流R指数有数据开始满仓持有，不择时、不调仓；同图对比沪深300、中证500、创业板、红利低波全收益指数。",
  },
  {
    id: "free-cash-flow-chinext-dynamic",
    title: "FCF/创业板动态",
    badge: "FCF Growth",
    href: "/strategy/free-cash-flow-chinext-dynamic",
    rule: "在自由现金流R和创业板R两个全收益指数之间满仓动态分配：风险平价作基础权重，趋势强弱决定倾斜，单边权重限制在 20%-80%。",
  },
  {
    id: "free-cash-flow-chinext-reversion",
    title: "FCF/创业板回归",
    badge: "FCF Reversion",
    href: "/strategy/free-cash-flow-chinext-reversion",
    rule: "在自由现金流R和创业板R之间做相对回归：用两者净值比值 Z-score 判断谁相对偏热，反向增配另一边，始终保持满仓。",
  },
  {
    id: "free-cash-flow-chinext-balanced-reversion",
    title: "FCF/创业板平衡回归",
    badge: "Balanced",
    href: "/strategy/free-cash-flow-chinext-balanced-reversion",
    rule: "以 50/50 为底仓，风险平价做更大幅度修正；相对比值极端时先做预备回归倾斜，反转确认后加大倾斜。",
  },
  {
    id: "free-cash-flow-ma-deviation",
    title: "FCF均线偏离",
    badge: "FCF MA",
    href: "/strategy/free-cash-flow-ma-deviation",
    rule: "只交易 480092.CNI 自由现金流R指数；默认用 MA120 与 ±5% 偏离带调仓，低于下轨恢复满仓，高于上轨降到半仓；页面同时展示全样本参数扫描，筛参结果仅供研究。",
  },
  {
    id: "free-cash-flow-dual-ma-crossover",
    title: "FCF双均线",
    badge: "Dual MA",
    href: "/strategy/free-cash-flow-dual-ma-crossover",
    rule: "只交易 480092.CNI 自由现金流R指数；默认 MA30/MA90 金叉满仓、死叉空仓；页面同时展示快慢均线参数扫描和样本外验证，筛参结果仅供研究。",
  },
];

const strategyDirectorySort = {
  key: "annualized",
  direction: "desc",
};

function strategyDirectoryPayload(results, card) {
  if (card.source === "etf_rotation_backtest") return results.etf_rotation_backtest || {};
  if (card.source === "macro_style_etf_backtest") return results.macro_style_etf_backtest || {};
  return (results.strategy_suite_backtests || []).find((item) => item.strategy_id === card.id) || {};
}

function strategyDirectorySummary(card, payload) {
  const summary = payload.summary || {};
  const totalReturn = summary[card.returnKey || "strategy_total_return"];
  const sessions = summary.sessions;
  const annualized = typeof summary.annualized_return === "number"
    ? summary.annualized_return
    : annualizedFromTotal(totalReturn, sessions);
  return {
    totalReturn,
    equalReturn: summary[card.equalReturnKey || "equal_weight_return"],
    annualized,
    alpha: summary.alpha_vs_equal_weight,
    drawdown: summary.max_drawdown,
    equalDrawdown: summary[card.equalDrawdownKey || "equal_weight_max_drawdown"],
    sharpe: summary.sharpe,
    sessions: summary.sessions,
    endDate: summary.end_date,
  };
}

function strategyDirectoryLookaheadNote(payload) {
  const metadata = payload.metadata || {};
  if (metadata.no_lookahead_bias === false) {
    return metadata.lookahead_note || "该策略使用回看锚点或未来信息，只适合复盘研究，不应与无未来函数策略直接排序比较。";
  }
  if (metadata.lookahead_note) return metadata.lookahead_note;
  return "";
}

function strategyDirectoryRows(results) {
  return STRATEGY_DIRECTORY_CARDS.map((card) => {
    const payload = strategyDirectoryPayload(results, card);
    const data = strategyDirectorySummary(card, payload);
    const lookaheadNote = strategyDirectoryLookaheadNote(payload);
    return {
      ...card,
      payload,
      data,
      lookahead: Boolean(lookaheadNote),
      lookaheadNote,
      evaluation: strategyDirectoryEvaluation(card, payload),
    };
  });
}

function strategyDirectorySortValue(row, key) {
  const values = {
    strategy: row.title,
    annualized: row.data.annualized,
    totalReturn: row.data.totalReturn,
    drawdown: row.data.drawdown,
    sharpe: row.data.sharpe,
    alpha: row.data.alpha,
    endDate: row.data.endDate,
  };
  return values[key];
}

function sortStrategyDirectoryRows(rows) {
  const key = strategyDirectorySort.key;
  const direction = strategyDirectorySort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (left.lookahead !== right.lookahead) return left.lookahead ? 1 : -1;
    const leftValue = strategyDirectorySortValue(left, key);
    const rightValue = strategyDirectorySortValue(right, key);
    const leftMissing = leftValue === null || leftValue === undefined || Number.isNaN(leftValue);
    const rightMissing = rightValue === null || rightValue === undefined || Number.isNaN(rightValue);
    if (leftMissing && rightMissing) return left.title.localeCompare(right.title, "zh-CN");
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      if (leftValue !== rightValue) return (leftValue - rightValue) * direction;
      const leftSharpe = typeof left.data.sharpe === "number" ? left.data.sharpe : -Infinity;
      const rightSharpe = typeof right.data.sharpe === "number" ? right.data.sharpe : -Infinity;
      if (leftSharpe !== rightSharpe) return (leftSharpe - rightSharpe) * -1;
      return left.title.localeCompare(right.title, "zh-CN");
    }
    return String(leftValue).localeCompare(String(rightValue), "zh-CN") * direction;
  });
}

function strategyDirectoryHeader(label, key) {
  const active = strategyDirectorySort.key === key;
  const arrow = active ? (strategyDirectorySort.direction === "asc" ? "↑" : "↓") : "";
  const title = active ? `当前按${label}${strategyDirectorySort.direction === "asc" ? "升序" : "降序"}排序` : `点击按${label}排序`;
  return `<button class="strategy-table-sort${active ? " is-active" : ""}" type="button" data-strategy-sort="${key}" title="${escapeHtml(title)}">${escapeHtml(label)}<span>${arrow}</span></button>`;
}

function strategyDirectoryVerdict(data, comparisonLabel = "等权对照") {
  if (typeof data.totalReturn !== "number") return "回测摘要尚未生成，暂不能评价。";
  const hasAlpha = typeof data.alpha === "number";
  const hasDrawdownGap = typeof data.drawdown === "number" && typeof data.equalDrawdown === "number";
  const drawdownReduction = hasDrawdownGap ? Math.abs(data.equalDrawdown) - Math.abs(data.drawdown) : null;
  if (hasAlpha && data.alpha >= 0 && drawdownReduction !== null && drawdownReduction >= 0) {
    return `收益和回撤均优于${comparisonLabel}，可作为重点候选继续观察。`;
  }
  if (hasAlpha && data.alpha >= 0) {
    return "收益有超额，但回撤代价需要单独评估，适合限定场景使用。";
  }
  if (drawdownReduction !== null && drawdownReduction > 0) {
    return "更像降波动或防守工具，当前不是收益 Alpha 主力。";
  }
  return `当前回测未显示相对${comparisonLabel}的综合优势，暂作研究备选。`;
}

function strategyDirectoryEvaluation(card, payload) {
  const data = strategyDirectorySummary(card, payload);
  const comparisonLabel = payload.summary?.equal_weight_label || "等权";
  if (typeof data.totalReturn !== "number") return "回测数据缺失，等待重新生成后再评价。";
  const parts = [
    `截至 ${toIsoDate(data.endDate)}，累计收益 ${signedRatioText(data.totalReturn)}`,
    `最大回撤 ${percentText(data.drawdown)}`,
  ];
  if (typeof data.alpha === "number") parts.push(`相对${comparisonLabel} Alpha ${signedRatioText(data.alpha)}`);
  if (typeof data.sharpe === "number") parts.push(`夏普 ${fixedText(data.sharpe, 2)}`);
  return `${parts.join("，")}。${strategyDirectoryVerdict(data, comparisonLabel)}`;
}

function setStrategyDirectory(results) {
  const target = document.getElementById("strategyDirectoryGrid");
  if (!target) return;
  const rows = sortStrategyDirectoryRows(strategyDirectoryRows(results));
  target.innerHTML = `
    <div class="chart-panel strategy-directory-table" role="table" aria-label="策略回测对比表">
      <div class="strategy-directory-row strategy-directory-head" role="row">
        <div role="columnheader">排序</div>
        <div role="columnheader">${strategyDirectoryHeader("策略", "strategy")}</div>
        <div role="columnheader">${strategyDirectoryHeader("年化", "annualized")}</div>
        <div role="columnheader">${strategyDirectoryHeader("累计", "totalReturn")}</div>
        <div role="columnheader">${strategyDirectoryHeader("回撤", "drawdown")}</div>
        <div role="columnheader">${strategyDirectoryHeader("夏普", "sharpe")}</div>
        <div role="columnheader">${strategyDirectoryHeader("Alpha", "alpha")}</div>
        <div role="columnheader">${strategyDirectoryHeader("截至", "endDate")}</div>
        <div role="columnheader">规则与评价</div>
      </div>
      ${rows
        .map((row, index) => `
          <div class="strategy-directory-row${row.lookahead ? " has-lookahead" : ""}" role="row">
            <div class="strategy-rank" role="cell">${index + 1}</div>
            <div class="strategy-name-cell" role="cell">
              <span>${escapeHtml(row.badge)}</span>
              <a href="${row.href}">${escapeHtml(row.title)}</a>
              ${row.lookahead ? `<strong class="lookahead-badge" title="${escapeHtml(row.lookaheadNote)}">含未来函数</strong>` : ""}
            </div>
            <div class="metric-strong" role="cell">${signedRatioText(row.data.annualized)}</div>
            <div role="cell">${signedRatioText(row.data.totalReturn)}</div>
            <div role="cell">${percentText(row.data.drawdown)}</div>
            <div role="cell">${fixedText(row.data.sharpe, 2)}</div>
            <div role="cell">${signedRatioText(row.data.alpha)}</div>
            <div role="cell">${toIsoDate(row.data.endDate)}</div>
            <div class="strategy-rule-cell" role="cell">
              ${
                row.lookahead
                  ? `<p class="lookahead-warning"><strong>未来函数</strong>该策略使用回看锚点或未来信息，只适合复盘研究，已固定置底。</p>`
                  : ""
              }
              <p><strong>规则</strong>${escapeHtml(row.rule)}</p>
              <p><strong>评价</strong>${escapeHtml(row.evaluation)}</p>
            </div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function conclusionItemsForPage(results) {
  const items = results.conclusions || [];
  if (document.body?.dataset.page !== "validation") return items;
  return items.filter((item) =>
    /^(S1\.|H1\.|H2\.)/.test(item) || /结构化|默认结构化|波动单因子|风险观察/.test(item)
  );
}

function setApiCatalogPanel(catalog) {
  const docs = catalog.docs || {};
  const groups = catalog.groups || [];
  const recommended = catalog.recommended_entrypoints || [];
  const safety = catalog.safety || {};
  const safetyOk = Object.values(safety).every((value) => value === true);

  setText("apiEndpointCount", integerText(catalog.total_endpoints));
  setText("apiDocsStatus", docs.interactive ? `已开放 ${docs.interactive}` : "--");
  setHtml("apiRecommendedList", recommended.length
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
    : '<div class="api-empty-row">暂无推荐入口</div>');
  setHtml("apiGroupList", groups.length
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
    : '<div class="api-empty-row">暂无接口分组</div>');
  setText(
    "apiCatalogConclusion",
    safetyOk
      ? "GET /api 已统一输出接口目录；当前系统接口保持只读、模拟、无真实交易边界。"
      : "接口目录已开放，但系统边界需要复核。"
  );
}

function setResultsPanel(results) {
  setStrategyDirectory(results);

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
  setClassName("riskLevel", `risk-level-text risk-${decision.risk_level || "medium"}`);
  setText("recommendedExposure", percentText(decision.recommended_exposure));
  setText("riskAction", actionLabel(decision.action));
  setText("riskScore", fixedText(decision.risk_score, 3));
  setText("strategyMode", strategyLabel(decision.strategy_mode));
  setText("riskAlert", decision.alert || "--");
  setHtml("riskComponents", Object.entries(decision.risk_components || {})
    .map(
      ([key, value]) => `
        <div class="component-row">
          <span>${componentLabel(key)}</span>
          <strong>${percentText(value)}</strong>
          <i style="width:${typeof value === "number" ? Math.round(value * 100) : 0}%"></i>
        </div>
      `
    )
    .join(""));

  setText("portfolioExposure", percentText(portfolio.total_exposure));
  setText("portfolioCash", percentText(portfolio.cash_ratio));
  const constraints = portfolio.constraints || {};
  const constraintOk =
    constraints.cash_plus_exposure === 1 &&
    constraints.min_cash_satisfied === true &&
    constraints.max_exposure_satisfied === true &&
    constraints.strategy_allocation_sum === 1;
  setText("portfolioConstraint", constraintOk ? "通过" : "需检查");
  setHtml("strategyAllocation", Object.entries(portfolio.strategy_allocation || {})
    .map(
      ([strategy, weight]) => `
        <div class="allocation-row">
          <span>${strategyLabel(strategy)}</span>
          <strong>${percentText(weight)}</strong>
          <i style="width:${typeof weight === "number" ? Math.round(weight * 100) : 0}%"></i>
        </div>
      `
    )
    .join(""));
  setText(
    "portfolioConclusion",
    `R2.1 使用当前 ${regimeLabel(portfolio.regime)} 状态和风险评分 ${fixedText(portfolio.risk_score, 3)}，将风险资产仓位控制在 ${percentText(portfolio.total_exposure)}，其余保持现金。`
  );

  const enabledStrategies = route.enabled_strategies || [];
  const disabledStrategies = route.disabled_strategies || [];
  setText("routeEnabledCount", integerText(enabledStrategies.length));
  setText("routeDisabledCount", integerText(disabledStrategies.length));
  setHtml("routeEnabledList", enabledStrategies.length
    ? enabledStrategies.map((strategy) => `<span>${strategyLabel(strategy)}</span>`).join("")
    : "<em>无启用策略</em>");
  setHtml("routeBudgetList", Object.entries(route.strategy_budget || {})
    .map(
      ([strategy, weight]) => `
        <div class="allocation-row route-budget-row">
          <span>${strategyLabel(strategy)}</span>
          <strong>${percentText(weight)}</strong>
          <i style="width:${typeof weight === "number" ? Math.round(weight * 100) : 0}%"></i>
        </div>
      `
    )
    .join(""));
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
  setHtml("simulatedOrders", simulatedOrders
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
    .join(""));
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
  setHtml("systemBoundaryList", Object.entries(system.boundaries || {})
    .map(
      ([key, passed]) => `
        <div class="boundary-row">
          <span>${boundaryLabel(key)}</span>
          <strong>${passed ? "通过" : "需检查"}</strong>
        </div>
      `
    )
    .join(""));
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
  setClassName("metaEdgeLevel", `meta-edge-level meta-${metaEdge.meta_edge_level || "quiet"}`);
  setText("metaEdgeActiveCount", activeMetaSignals.length ? `${integerText(activeMetaSignals.length)} 个` : "无触发");
  setHtml("metaEdgeSignalList", activeMetaSignals.length
    ? activeMetaSignals.map((signal) => `<span>${metaSignalLabel(signal)}</span>`).join("")
    : "<em>当前无显著矛盾信号</em>");
  setHtml("metaEdgeStrengthList", Object.entries(metaSignalStrengths)
    .map(
      ([signal, strength]) => `
        <div class="meta-strength-row">
          <span>${metaSignalLabel(signal)}</span>
          <strong>${percentText(strength)}</strong>
          <i style="width:${typeof strength === "number" ? Math.round(strength * 100) : 0}%"></i>
        </div>
      `
    )
    .join(""));
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
  setHtml("styleScoreList", Object.entries(styleFactor.style_scores || {})
    .map(
      ([style, score]) => `
        <div class="style-score-row">
          <span>${styleLabel(style)}</span>
          <strong>${percentText(score)}</strong>
          <i style="width:${typeof score === "number" ? Math.round(score * 100) : 0}%"></i>
        </div>
      `
    )
    .join(""));
  setHtml("styleCandidateList", (etfUniverse.top_candidates || [])
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
    .join(""));
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
  setHtml("rotationTargetWeights", Object.entries(targetWeights)
    .map(
      ([code, weight]) => `
        <div class="rotation-weight-row">
          <span>${escapeHtml(code)}</span>
          <strong>${percentText(weight)}</strong>
          <i style="width:${typeof weight === "number" ? Math.round(weight * 100) : 0}%"></i>
        </div>
      `
    )
    .join(""));
  setHtml("rotationCandidateList", (etfRotation.top_candidates || [])
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
    .join(""));
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
  setHtml("regimeAttributionList", regimeOrder
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
    .join(""));
  setHtml("alphaSourceList", Object.entries(alphaDecomposition.sources || {})
    .map(
      ([source, value]) => `
        <div class="alpha-source-row">
          <span>${alphaSourceLabel(source)}</span>
          <strong>${signedRatioText(value)}</strong>
        </div>
      `
    )
    .join(""));
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
  setHtml("durationList", durationOrder
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
    .join(""));

  setHtml("conclusionList", listHtml(conclusionItemsForPage(results)));
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

function pageNeedsResults() {
  return Boolean(
    document.body?.dataset.resultsPage ||
      document.querySelector(
        "#riskLevel, #portfolioExposure, #styleRegime, #rotationSignal, #shadowFinalAlpha, #regimeAttributionTotalAlpha, #hazardRawRate"
      )
  );
}

function pageNeedsRegime() {
  return Boolean(document.querySelector("#regimePanel, #scoreList, #scoreHistoryChart"));
}

function pageNeedsCycle() {
  return Boolean(document.querySelector("#cycleTitle"));
}

function pageNeedsFullResults() {
  return Boolean(document.querySelector("#shadowEquityChart, #rotationBacktestChart, #macroStyleEtfChart"));
}

async function loadDashboard() {
  const button = document.getElementById("refreshButton");
  if (button) {
    button.disabled = true;
    button.textContent = "刷新中";
  }
  try {
    const needsRegime = pageNeedsRegime();
    const needsCycle = pageNeedsCycle();
    const needsResults = pageNeedsResults();
    const needsScoreHistory = Boolean(document.getElementById("scoreHistoryChart"));
    const resultUrl = pageNeedsFullResults() ? "/api/results/summary" : "/api/results/summary?compact=1";
    const [current, cycle, scoreHistory, results] = await Promise.all([
      needsRegime ? getJson("/api/regime/current") : Promise.resolve(null),
      needsCycle ? getJson("/api/regime/cycle") : Promise.resolve(null),
      needsScoreHistory ? getJson("/api/regime/score-history") : Promise.resolve(null),
      needsResults ? getJson(resultUrl) : Promise.resolve(null),
    ]);
    state.current = current || null;
    state.cycle = cycle || null;
    state.scoreHistory = scoreHistory || null;
    state.results = results || null;

    if (current) {
      setRegimePanel(current);
      setScoreList(current.sub_scores);
    }
    if (scoreHistory && document.getElementById("scoreHistoryChart")) {
      const chartHistory = mergeScoreHistoryCurrent(scoreHistory, current);
      renderScoreHistoryChart("scoreHistoryChart", chartHistory);
      setScoreHistoryNote(chartHistory);
    }
    if (cycle) setCyclePanel(phaseFromMajorCycle(cycle));
    if (current && cycle) setRegimeContextNote(current, cycle);
    if (results) setResultsPanel(results);
    if (results && document.getElementById("shadowEquityChart")) renderShadowEquityChart("shadowEquityChart", results.shadow_backtest || {});
    if (results && document.getElementById("rotationBacktestChart")) renderEtfRotationBacktestChart("rotationBacktestChart", results.etf_rotation_backtest || {});
    if (results && document.getElementById("macroStyleEtfChart")) renderMacroStyleEtfBacktestChart("macroStyleEtfChart", results.macro_style_etf_backtest || {});
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "刷新";
    }
  }
}

document.getElementById("refreshButton")?.addEventListener("click", loadDashboard);
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("[data-strategy-sort]");
  if (!button || !document.getElementById("strategyDirectoryGrid")) return;
  const key = button.dataset.strategySort;
  if (!key) return;
  if (strategyDirectorySort.key === key) {
    strategyDirectorySort.direction = strategyDirectorySort.direction === "asc" ? "desc" : "asc";
  } else {
    strategyDirectorySort.key = key;
    strategyDirectorySort.direction = key === "strategy" ? "asc" : "desc";
  }
  if (state.results) setStrategyDirectory(state.results);
});
document.getElementById("rotationBacktestReset")?.addEventListener("click", () => {
  resetEtfRotationBacktestChart("rotationBacktestChart");
});
document.getElementById("macroStyleReset")?.addEventListener("click", () => {
  resetEtfRotationBacktestChart("macroStyleEtfChart");
});
loadDashboard();
