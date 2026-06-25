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
      ...baseLayout(310),
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

function renderTimeline(elementId, items) {
  const x = items.map((item) => toIsoDate(item.as_of));
  const colors = items.map((item) => REGIME_COLORS[item.regime] || REGIME_COLORS.range);
  Plotly.react(
    elementId,
    [
      {
        type: "bar",
        x,
        y: items.map(() => 1),
        marker: { color: colors },
        customdata: items.map((item) => [regimeLabel(item.regime), item.confidence, item.regime_score]),
        hovertemplate:
          "%{x}<br>%{customdata[0]}<br>confidence %{customdata[1]:.2f}<br>score %{customdata[2]:.2f}<extra></extra>",
      },
    ],
    {
      ...baseLayout(310),
      yaxis: { visible: false, fixedrange: true },
      xaxis: { tickformat: "%m-%d", gridcolor: "#edf0f5" },
      bargap: 0.08,
      showlegend: false,
    },
    { responsive: true, displayModeBar: false }
  );
}

function buildRegimeShapes(items) {
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
      x1: toIsoDate(nextRange?.start || range.end),
      y0: 0,
      y1: 1,
      fillcolor: SHADE_COLORS[range.regime] || SHADE_COLORS.range,
      line: { width: 0 },
      layer: "below",
    };
  });
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

function renderIndexChart(elementId, items, phase) {
  const x = items.map((item) => toIsoDate(item.as_of));
  const close = items.map((item) => item.index?.close ?? null);
  const ma120 = items.map((item) => item.index?.ma120 ?? null);
  const ma250 = items.map((item) => item.index?.ma250 ?? null);
  const markers = [];
  if (phase?.startDate) {
    markers.push(markerLine(toIsoDate(phase.startDate), "#17201b", "周期开始", 1.03));
  }
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
      shapes: [...buildRegimeShapes(items), ...markers.map((marker) => marker.shape)],
      annotations: markers.map((marker) => marker.annotation),
      xaxis: { tickformat: "%Y", gridcolor: "#edf0f5" },
      yaxis: { gridcolor: "#edf0f5", zeroline: false },
      legend: { orientation: "h", x: 0, y: 1.12 },
    },
    { responsive: true, displayModeBar: false }
  );
}
