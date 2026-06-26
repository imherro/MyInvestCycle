const REGIME_COLORS = {
  bull: "#c73d3d",
  bear: "#17885b",
  range: "#697386",
  transition: "#c69214",
};

const REGIME_LABELS = {
  bull: "牛市",
  bear: "熊市",
  range: "震荡",
  transition: "过渡",
};

const SHADE_COLORS = {
  bull: "rgba(199, 61, 61, 0.12)",
  bear: "rgba(23, 136, 91, 0.12)",
  range: "rgba(105, 115, 134, 0.11)",
  transition: "rgba(198, 146, 20, 0.14)",
};

function regimeLabel(regime) {
  return REGIME_LABELS[regime] || regime || "--";
}

function toIsoDate(value) {
  if (!value || value.length !== 8) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function scorePercent(value) {
  if (typeof value !== "number") return "--";
  return `${Math.round(value * 100)}%`;
}

function baseLayout(height) {
  return {
    height,
    margin: { l: 42, r: 18, t: 18, b: 42 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Segoe UI, Microsoft YaHei, Arial, sans-serif", color: "#1d2433" },
  };
}

function renderRadar(elementId, scores) {
  const labels = ["趋势", "宽度", "流动性", "波动稳定"];
  const values = [scores.trend, scores.breadth, scores.liquidity, scores.volatility];
  Plotly.react(
    elementId,
    [
      {
        type: "scatterpolar",
        r: [...values, values[0]],
        theta: [...labels, labels[0]],
        fill: "toself",
        fillcolor: "rgba(38, 99, 235, 0.18)",
        line: { color: "#2663eb", width: 3 },
        marker: { size: 7, color: "#2663eb" },
        hovertemplate: "%{theta}: %{r:.2f}<extra></extra>",
      },
    ],
    {
      ...baseLayout(260),
      polar: {
        bgcolor: "rgba(0,0,0,0)",
        radialaxis: { range: [0, 1], tickvals: [0, 0.5, 1], gridcolor: "#dde3ec" },
        angularaxis: { gridcolor: "#dde3ec" },
      },
      showlegend: false,
    },
    { responsive: true, displayModeBar: false }
  );
}

function renderShadowEquityChart(elementId, shadowBacktest) {
  const shadowCurve = shadowBacktest?.shadow_equity_curve || [];
  const benchmarkCurve = shadowBacktest?.benchmark_equity_curve || [];
  const x = shadowCurve.map((item) => toIsoDate(item.date));
  const shadow = shadowCurve.map((item) => item.value);
  const benchmarkByDate = new Map(benchmarkCurve.map((item) => [item.date, item.value]));
  const benchmark = shadowCurve.map((item) => benchmarkByDate.get(item.date) ?? null);
  if (!shadowCurve.length) {
    Plotly.purge(elementId);
    return;
  }
  Plotly.react(
    elementId,
    [
      {
        type: "scatter",
        mode: "lines",
        name: "影子账户",
        x,
        y: shadow,
        line: { color: "#2663eb", width: 2.3 },
        hovertemplate: "%{x}<br>影子账户 %{y:.3f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "510500 基准",
        x,
        y: benchmark,
        line: { color: "#c73d3d", width: 2, dash: "dot" },
        hovertemplate: "%{x}<br>510500 %{y:.3f}<extra></extra>",
      },
    ],
    {
      ...baseLayout(170),
      margin: { l: 36, r: 8, t: 12, b: 34 },
      xaxis: { tickformat: "%Y", gridcolor: "#edf0f5" },
      yaxis: { gridcolor: "#edf0f5", zeroline: false },
      legend: { orientation: "h", x: 0, y: 1.18, font: { size: 11 } },
    },
    { responsive: true, displayModeBar: false }
  );
}

function renderEtfRotationBacktestChart(elementId, backtest) {
  const items = backtest?.equity_curve || [];
  const x = items.map((item) => toIsoDate(item.date));
  const rotation = items.map((item) => item.rotation_equity ?? null);
  const benchmark500 = items.map((item) => item.benchmark_510500_equity ?? null);
  const benchmark300 = items.map((item) => item.benchmark_510300_equity ?? null);
  const equalWeight = items.map((item) => item.equal_weight_basket_equity ?? null);
  Plotly.react(
    elementId,
    [
      {
        type: "scatter",
        mode: "lines",
        name: "轮动组合",
        x,
        y: rotation,
        line: { color: "#2663eb", width: 2.4 },
        hovertemplate: "%{x}<br>轮动 %{y:.3f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "510500",
        x,
        y: benchmark500,
        line: { color: "#697386", width: 1.8 },
        hovertemplate: "%{x}<br>510500 %{y:.3f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "510300",
        x,
        y: benchmark300,
        line: { color: "#c69214", width: 1.7, dash: "dot" },
        hovertemplate: "%{x}<br>510300 %{y:.3f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "等权ETF",
        x,
        y: equalWeight,
        line: { color: "#17885b", width: 1.7, dash: "dash" },
        hovertemplate: "%{x}<br>等权 %{y:.3f}<extra></extra>",
      },
    ],
    {
      ...baseLayout(250),
      margin: { l: 42, r: 16, t: 16, b: 36 },
      xaxis: { tickformat: "%Y", gridcolor: "#edf0f5" },
      yaxis: { gridcolor: "#edf0f5", zeroline: false },
      legend: { orientation: "h", x: 0, y: 1.18 },
    },
    { responsive: true, displayModeBar: false }
  );
}

function buildRegimeShapes(items, options = {}) {
  const y0 = options.y0 ?? 0;
  const y1 = options.y1 ?? 1;
  const xEnd = options.xEnd || null;
  const ranges = [];
  for (const item of items) {
    const last = ranges[ranges.length - 1];
    if (last && last.regime === item.regime) {
      last.end = item.as_of;
    } else {
      ranges.push({ regime: item.regime, start: item.as_of, end: item.as_of });
    }
  }
  return ranges.map((range, index) => {
    const nextRange = ranges[index + 1];
    return {
      type: "rect",
      xref: "x",
      yref: "paper",
      x0: toIsoDate(range.start),
      x1: toIsoDate(nextRange?.start || xEnd || range.end),
      y0,
      y1,
      fillcolor: SHADE_COLORS[range.regime] || SHADE_COLORS.range,
      line: { width: 0 },
      layer: "below",
    };
  });
}

function forecastWindowShape(x0, x1) {
  return {
    type: "rect",
    xref: "x",
    yref: "paper",
    x0,
    x1,
    y0: 0,
    y1: 1,
    fillcolor: "rgba(38, 99, 235, 0.06)",
    line: { width: 0 },
    layer: "below",
  };
}

function markerLine(x, color, label, yPosition) {
  return {
    shape: {
      type: "line",
      xref: "x",
      yref: "paper",
      x0: x,
      x1: x,
      y0: 0,
      y1: 1,
      line: { color, width: 2, dash: "dash" },
      layer: "above",
    },
    annotation: {
      x,
      y: yPosition,
      xref: "x",
      yref: "paper",
      text: label,
      showarrow: false,
      bgcolor: "rgba(255,255,255,0.88)",
      bordercolor: color,
      borderwidth: 1,
      font: { color, size: 12 },
    },
  };
}

function renderCycleTrackChart(elementId, track) {
  const items = track.items || [];
  const forecast = track.forecast || {};
  const paths = forecast.paths || [];
  const x = items.map((item) => toIsoDate(item.as_of));
  const close = items.map((item) => item.index?.close ?? null);
  const ma120 = items.map((item) => item.index?.ma120 ?? null);
  const ma250 = items.map((item) => item.index?.ma250 ?? null);
  const latest = items[items.length - 1];
  const latestDate = toIsoDate(latest?.as_of);
  const latestClose = latest?.index?.close ?? null;
  const futureX = paths.map((path) => toIsoDate(path.as_of));
  const futureEnd = futureX[futureX.length - 1];
  const projectionX = latestDate ? [latestDate, ...futureX] : futureX;
  const projectionTrace = (name, key, color) => ({
    type: "scatter",
    mode: "lines+markers",
    name,
    x: projectionX,
    y: latestClose === null ? paths.map((path) => path[key]) : [latestClose, ...paths.map((path) => path[key])],
    line: { color, width: 2, dash: "dash" },
    marker: { size: 6, color },
    hovertemplate: `%{x}<br>${name} %{y:.2f}<extra></extra>`,
  });
  const markers = [];
  if (track.cycle?.start_date) {
    markers.push(markerLine(toIsoDate(track.cycle.start_date), "#17201b", "本轮开始", 1.03));
  }
  if (latestDate) {
    markers.push(markerLine(latestDate, "#2663eb", "当前", 0.93));
  }
  const shapes = [
    ...buildRegimeShapes(items, { y0: 0, y1: 0.12, xEnd: latestDate }),
    ...(latestDate && futureEnd ? [forecastWindowShape(latestDate, futureEnd)] : []),
    ...markers.map((marker) => marker.shape),
  ];
  Plotly.react(
    elementId,
    [
      {
        type: "scatter",
        mode: "lines",
        name: "上证收盘",
        x,
        y: close,
        line: { color: "#2663eb", width: 2.6 },
        hovertemplate: "%{x}<br>收盘 %{y:.2f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "MA120",
        x,
        y: ma120,
        line: { color: "#c69214", width: 1.8, dash: "dot" },
        hovertemplate: "%{x}<br>MA120 %{y:.2f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "MA250",
        x,
        y: ma250,
        line: { color: "#697386", width: 1.8, dash: "dash" },
        hovertemplate: "%{x}<br>MA250 %{y:.2f}<extra></extra>",
      },
      ...(paths.length
        ? [
            projectionTrace("谨慎", "cautious", "#17885b"),
            projectionTrace("中性", "neutral", "#697386"),
            projectionTrace("乐观", "optimistic", "#c73d3d"),
          ]
        : []),
    ],
    {
      ...baseLayout(440),
      margin: { l: 48, r: 18, t: 24, b: 44 },
      shapes,
      annotations: [
        ...markers.map((marker) => marker.annotation),
        {
          x: x[0],
          y: 0.06,
          xref: "x",
          yref: "paper",
          text: "状态带",
          showarrow: false,
          xanchor: "left",
          font: { color: "#667085", size: 12 },
        },
      ],
      xaxis: { tickformat: "%Y-%m", gridcolor: "#edf0f5", range: futureEnd ? [x[0], futureEnd] : undefined },
      yaxis: { gridcolor: "#edf0f5", zeroline: false },
      legend: { orientation: "h", x: 0, y: 1.12 },
    },
    { responsive: true, displayModeBar: false }
  );
}

function renderIndexChart(elementId, items, phase, blocks = []) {
  const x = items.map((item) => toIsoDate(item.as_of));
  const close = items.map((item) => item.index?.close ?? null);
  const ma120 = items.map((item) => item.index?.ma120 ?? null);
  const ma250 = items.map((item) => item.index?.ma250 ?? null);
  const bullBlocks = blocks.filter((block) => block.major && block.state === "bull");
  const markers = bullBlocks.map((block, index) =>
    markerLine(toIsoDate(block.start_date), REGIME_COLORS.bull, block.short_label || `${String(block.start_date).slice(0, 4)} 牛市`, index % 2 ? 0.95 : 1.05)
  );
  if (phase?.currentDate) {
    markers.push(markerLine(toIsoDate(phase.currentDate), "#2663eb", "当前", 0.93));
  }
  Plotly.react(
    elementId,
    [
      {
        type: "scatter",
        mode: "lines",
        name: "上证收盘",
        x,
        y: close,
        line: { color: "#2663eb", width: 2.5 },
        hovertemplate: "%{x}<br>close %{y:.2f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "MA120",
        x,
        y: ma120,
        line: { color: "#c69214", width: 2, dash: "dot" },
        hovertemplate: "%{x}<br>MA120 %{y:.2f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "MA250",
        x,
        y: ma250,
        line: { color: "#697386", width: 2, dash: "dash" },
        hovertemplate: "%{x}<br>MA250 %{y:.2f}<extra></extra>",
      },
    ],
    {
      ...baseLayout(390),
      margin: { l: 48, r: 18, t: 34, b: 44 },
      shapes: [...buildRegimeShapes(items), ...markers.map((marker) => marker.shape)],
      annotations: markers.map((marker) => marker.annotation),
      xaxis: { tickformat: "%Y", gridcolor: "#edf0f5" },
      yaxis: { gridcolor: "#edf0f5", zeroline: false },
      legend: { orientation: "h", x: 0, y: 1.12 },
    },
    { responsive: true, displayModeBar: false }
  );
}
