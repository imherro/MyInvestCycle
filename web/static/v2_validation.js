function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value == null || value === "" ? "--" : String(value);
}

function fmtPercent(value) {
  if (typeof value !== "number") return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function fmtNumber(value, digits = 2) {
  if (typeof value !== "number") return "--";
  return value.toFixed(digits);
}

function toIsoDate(value) {
  const text = String(value || "");
  return text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text || "--";
}

async function getJson(url) {
  const requestUrl = new URL(url, window.location.origin);
  requestUrl.searchParams.set("_t", Date.now().toString());
  const response = await fetch(requestUrl.toString(), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function renderChecks(payload) {
  const validation = payload.validation || {};
  const metadata = payload.metadata || {};
  const checks = [
    ["Walk-forward T+1", validation.walk_forward_t_plus_1],
    ["只是假设暴露验证", validation.uses_hypothetical_exposure_only],
    ["无交易执行", metadata.no_trade_execution],
    ["无下单", metadata.no_order_generation],
    ["无券商连接", metadata.no_broker_connection],
    ["快照错误数", validation.snapshot_error_count === 0],
  ];
  const target = document.getElementById("validationChecks");
  if (!target) return;
  target.innerHTML = checks
    .map(([label, ok]) => `<div class="v2-list-row"><span>${label}</span><strong>${ok ? "通过" : "检查"}</strong></div>`)
    .join("");
}

function renderChart(curve) {
  const chart = document.getElementById("v2ValidationChart");
  if (!chart || !window.Plotly) return;
  const dates = curve.map((row) => toIsoDate(row.date));
  const traces = [
    ["V2 配置意图", "v2_equity", "#2563eb"],
    ["510300", "benchmark_510300_equity", "#dc2626"],
    ["510500", "benchmark_510500_equity", "#ef4444"],
    ["旧 S1.1", "old_s1_equity", "#64748b"],
    ["M2.1", "m2_macro_style_equity", "#059669"],
  ].map(([name, key, color]) => ({
    type: "scatter",
    mode: "lines",
    name,
    x: dates,
    y: curve.map((row) => row[key]),
    line: { color, width: name === "V2 配置意图" ? 3 : 2 },
    hovertemplate: "%{x}<br>%{y:.3f}<extra>" + name + "</extra>",
  }));
  Plotly.newPlot(
    chart,
    traces,
    {
      margin: { l: 48, r: 20, t: 12, b: 40 },
      hovermode: "x unified",
      legend: { orientation: "h", x: 0, y: 1.12 },
      xaxis: { showgrid: false },
      yaxis: { tickformat: ".2f", gridcolor: "rgba(148, 163, 184, 0.18)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
    },
    { responsive: true, displayModeBar: true }
  );
}

function renderBenchmarkTable(comparison) {
  const target = document.getElementById("benchmarkRows");
  if (!target) return;
  const rows = Object.values(comparison || {});
  target.innerHTML = rows
    .map((item) => {
      const benchmark = item.benchmark || {};
      return `<tr>
        <td>${item.label || "--"}</td>
        <td>${fmtPercent(benchmark.total_return)}</td>
        <td>${fmtPercent(benchmark.annualized_return)}</td>
        <td>${fmtPercent(benchmark.max_drawdown)}</td>
        <td>${fmtPercent(item.excess_return)}</td>
        <td>${fmtPercent(item.hit_rate)}</td>
      </tr>`;
    })
    .join("");
}

function renderStateTable(attribution) {
  const target = document.getElementById("stateRows");
  if (!target) return;
  const rows = Object.entries(attribution?.structural_state || {});
  target.innerHTML = rows
    .map(([state, item]) => `<tr>
      <td>${state}</td>
      <td>${item.sessions ?? "--"}</td>
      <td>${fmtPercent(item.strategy_return)}</td>
      <td>${fmtPercent(item.benchmark_return)}</td>
      <td>${fmtPercent(item.alpha)}</td>
      <td>${fmtPercent(item.average_exposure)}</td>
    </tr>`)
    .join("");
}

function renderBacktest(payload) {
  const summary = payload.summary || {};
  setText("validationHeadline", `V2 年化 ${fmtPercent(summary.v2_annualized_return)} · Alpha vs 510500 ${fmtPercent(summary.alpha_vs_510500)}`);
  setText("validationWindow", `${toIsoDate(summary.start_date)} - ${toIsoDate(summary.end_date)}`);
  setText("v2Annualized", fmtPercent(summary.v2_annualized_return));
  setText("v2Drawdown", fmtPercent(summary.v2_max_drawdown));
  setText("v2TotalReturn", fmtPercent(summary.v2_total_return));
  setText("v2Sharpe", fmtNumber(summary.v2_sharpe));
  setText("v2Calmar", fmtNumber(summary.v2_calmar));
  setText("v2AvgExposure", fmtPercent(summary.average_exposure));
  setText(
    "validationNote",
    `V2 跑赢旧 S1.1 ${fmtPercent(summary.alpha_vs_old_s1)}，跑赢 M2.1 ${fmtPercent(summary.alpha_vs_m2_macro_style)}；但落后 510300 ${fmtPercent(summary.alpha_vs_510300)}，落后 510500 ${fmtPercent(summary.alpha_vs_510500)}。这是验证结论，不是交易建议。`
  );
  renderChecks(payload);
  renderChart(payload.equity_curve || []);
  renderBenchmarkTable(payload.benchmark_comparison || {});
  renderStateTable(payload.state_attribution || {});
}

async function loadV2Validation() {
  try {
    setText("validationNote", "加载中...");
    const payload = await getJson("/api/v2/backtest");
    renderBacktest(payload);
  } catch (error) {
    setText("validationNote", `加载失败：${error.message}`);
  }
}

document.getElementById("refreshButton")?.addEventListener("click", loadV2Validation);
loadV2Validation();
