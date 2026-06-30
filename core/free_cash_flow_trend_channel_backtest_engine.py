from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

import numpy as np
import pandas as pd

from core.alpha_validation_engine import compound_return, max_drawdown, performance_metrics
from core.etf_return_utils import coerce_price_frame, daily_return_series
from core.strategy_suite_backtest_engine import Asset


INDEX_RETURN_SOURCE = (
    "Tushare index_daily for 932365.CSI; total-return code is requested first when available, "
    "but the current local source falls back to the price index when total-return rows are unavailable."
)


@dataclass(frozen=True)
class FreeCashFlowTrendSpec:
    strategy_id: str
    name: str
    short_name: str
    description: str
    method: list[str]
    index_code: str
    benchmark_codes: tuple[str, ...]
    reduce_exposure: float
    upper_signal: str
    pivot_window: int = 20
    min_pivots: int = 3
    max_pivots: int = 8
    min_tolerance: float = 0.025
    max_tolerance: float = 0.08
    vol_window: int = 60
    vol_horizon_sessions: int = 20
    vol_multiplier: float = 0.5
    warmup_calendar_days: int = 1800


FREE_CASH_FLOW_UNIVERSE = (
    Asset("932365.CSI", "中证全指自由现金流指数", "自由现金流"),
    Asset("CASH", "现金", "现金/空仓"),
)


FREE_CASH_FLOW_TREND_SPECS: dict[str, FreeCashFlowTrendSpec] = {
    "free-cash-flow-trend-half": FreeCashFlowTrendSpec(
        strategy_id="free-cash-flow-trend-half",
        name="自由现金流趋势通道策略（半仓防守版）",
        short_name="自由现金流半仓",
        description="用中证全指自由现金流指数的已确认历史高低点滚动拟合趋势通道，上轨附近降到半仓，下轨附近恢复满仓。",
        method=[
            "标的使用 932365.CSI 中证全指自由现金流指数；优先尝试全收益指数，若 Tushare 无可用全收益序列则使用价格指数并明确标注。",
            "用前后各 20 个交易日确认历史高点/低点；只有确认日已经发生的拐点才能进入当日趋势线拟合，避免未来函数。",
            "分别取最近最多 8 个已确认高点和低点，在 log(price) 上做线性拟合，形成上轨和下轨。",
            "价格进入上轨容忍带或突破上轨后，下一交易日权益暴露降到 50%；价格进入下轨容忍带或跌破下轨后，下一交易日恢复 100%。",
            "容忍带由最近 60 日波动率自适应生成，并限制在 2.5% 到 8% 之间；现金部分按 0 收益处理，用于纯粹检验指数择时。",
        ],
        index_code="932365.CSI",
        benchmark_codes=("932365.CSI",),
        reduce_exposure=0.50,
        upper_signal="fcf_channel_half_reduce",
    ),
    "free-cash-flow-trend-full": FreeCashFlowTrendSpec(
        strategy_id="free-cash-flow-trend-full",
        name="自由现金流趋势通道策略（满仓/空仓版）",
        short_name="自由现金流空仓",
        description="同样使用自由现金流指数趋势通道，但上轨附近直接降到 0%，下轨附近恢复 100%，用于检验更激进的择时效果。",
        method=[
            "标的使用 932365.CSI 中证全指自由现金流指数；优先尝试全收益指数，若 Tushare 无可用全收益序列则使用价格指数并明确标注。",
            "用前后各 20 个交易日确认历史高点/低点；只有确认日已经发生的拐点才能进入当日趋势线拟合，避免未来函数。",
            "分别取最近最多 8 个已确认高点和低点，在 log(price) 上做线性拟合，形成上轨和下轨。",
            "价格进入上轨容忍带或突破上轨后，下一交易日权益暴露降到 0%；价格进入下轨容忍带或跌破下轨后，下一交易日恢复 100%。",
            "容忍带由最近 60 日波动率自适应生成，并限制在 2.5% 到 8% 之间；现金部分按 0 收益处理，用于纯粹检验指数择时。",
        ],
        index_code="932365.CSI",
        benchmark_codes=("932365.CSI",),
        reduce_exposure=0.0,
        upper_signal="fcf_channel_full_exit",
    ),
}


def _asset_map() -> dict[str, Asset]:
    return {asset.code: asset for asset in FREE_CASH_FLOW_UNIVERSE}


def _benchmark_key(code: str) -> str:
    return code.split(".")[0]


def _benchmark_return_column(code: str) -> str:
    return f"benchmark_{_benchmark_key(code)}_return"


def _benchmark_equity_column(code: str) -> str:
    return f"benchmark_{_benchmark_key(code)}_equity"


def _weights(exposure: float) -> dict[str, float]:
    exposure = max(0.0, min(1.0, float(exposure)))
    cash = 1.0 - exposure
    result = {"932365.CSI": round(exposure, 6)}
    if cash > 0.000001:
        result["CASH"] = round(cash, 6)
    return result


def _target_turnover(previous: Mapping[str, float], current: Mapping[str, float]) -> float:
    keys = set(previous) | set(current)
    return round(sum(abs(float(current.get(key, 0.0)) - float(previous.get(key, 0.0))) for key in keys) / 2.0, 6)


def _confirmed_pivots(prices: pd.Series, *, window: int) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    highs: list[dict[str, object]] = []
    lows: list[dict[str, object]] = []
    values = prices.to_numpy(dtype=float)
    dates = prices.index.astype(str).tolist()
    for index in range(window, len(values) - window):
        segment = values[index - window : index + window + 1]
        current = values[index]
        confirm_index = index + window
        if current >= float(np.nanmax(segment)) and current > float(values[index - 1]) and current >= float(values[index + 1]):
            highs.append(
                {
                    "pivot_index": index,
                    "confirm_index": confirm_index,
                    "date": dates[index],
                    "confirm_date": dates[confirm_index],
                    "price": float(current),
                }
            )
        if current <= float(np.nanmin(segment)) and current < float(values[index - 1]) and current <= float(values[index + 1]):
            lows.append(
                {
                    "pivot_index": index,
                    "confirm_index": confirm_index,
                    "date": dates[index],
                    "confirm_date": dates[confirm_index],
                    "price": float(current),
                }
            )
    return highs, lows


def _fit_log_line(pivots: list[dict[str, object]], *, current_index: int, spec: FreeCashFlowTrendSpec) -> float | None:
    eligible = [pivot for pivot in pivots if int(pivot["confirm_index"]) <= current_index]
    if len(eligible) < spec.min_pivots:
        return None
    selected = eligible[-spec.max_pivots :]
    x = np.array([float(pivot["pivot_index"]) for pivot in selected], dtype=float)
    y = np.log(np.array([float(pivot["price"]) for pivot in selected], dtype=float))
    if len(set(x.tolist())) < 2:
        return None
    slope, intercept = np.polyfit(x, y, 1)
    return float(np.exp(intercept + slope * current_index))


def _tolerance(returns: pd.Series, *, current_date: str, spec: FreeCashFlowTrendSpec) -> float:
    recent = returns.loc[:current_date].dropna().tail(spec.vol_window)
    if len(recent) < max(20, spec.vol_window // 2):
        return spec.min_tolerance
    horizon_vol = float(recent.std() * (spec.vol_horizon_sessions ** 0.5))
    return max(spec.min_tolerance, min(spec.max_tolerance, spec.vol_multiplier * horizon_vol))


def _build_indicator_frame(frame: pd.DataFrame, spec: FreeCashFlowTrendSpec) -> pd.DataFrame:
    prices = coerce_price_frame(frame)
    if prices.empty:
        raise ValueError("no free cash flow index rows available")
    prices = prices.drop_duplicates(subset=["trade_date"], keep="last").sort_values("trade_date")
    close = prices.set_index("trade_date")["close"].astype(float)
    returns = daily_return_series(prices).reindex(close.index).fillna(0.0)
    highs, lows = _confirmed_pivots(close, window=spec.pivot_window)
    base_close = float(close.iloc[0])

    rows: list[dict[str, object]] = []
    for current_index, date_text in enumerate(close.index.astype(str)):
        upper = _fit_log_line(highs, current_index=current_index, spec=spec)
        lower = _fit_log_line(lows, current_index=current_index, spec=spec)
        current_close = float(close.loc[date_text])
        tolerance = _tolerance(returns, current_date=date_text, spec=spec)
        valid = upper is not None and lower is not None and upper > lower
        distance_to_upper = current_close / upper - 1.0 if valid else None
        distance_to_lower = current_close / lower - 1.0 if valid else None
        upper_zone = bool(valid and distance_to_upper is not None and distance_to_upper >= -tolerance)
        lower_zone = bool(valid and distance_to_lower is not None and distance_to_lower <= tolerance)
        rows.append(
            {
                "date": date_text,
                "close": current_close,
                "index_equity": current_close / base_close,
                "upper_line": upper,
                "lower_line": lower,
                "upper_equity": upper / base_close if upper is not None else None,
                "lower_equity": lower / base_close if lower is not None else None,
                "distance_to_upper": distance_to_upper,
                "distance_to_lower": distance_to_lower,
                "tolerance": tolerance,
                "upper_zone": upper_zone,
                "lower_zone": lower_zone,
                "confirmed_high_count": sum(1 for pivot in highs if int(pivot["confirm_index"]) <= current_index),
                "confirmed_low_count": sum(1 for pivot in lows if int(pivot["confirm_index"]) <= current_index),
                "benchmark_return": float(returns.loc[date_text]),
            }
        )
    return pd.DataFrame(rows)


def _signal_for_row(row: pd.Series, current_exposure: float, spec: FreeCashFlowTrendSpec) -> tuple[float, str, list[str]]:
    if bool(row.get("upper_zone")) and bool(row.get("lower_zone")):
        return current_exposure, "fcf_channel_hold", ["上下轨距离过近或价格同时触发上下轨容忍带，维持原仓位。"]
    if bool(row.get("upper_zone")):
        return spec.reduce_exposure, spec.upper_signal, [
            f"价格距离上轨 {float(row['distance_to_upper']):.2%}，进入 {float(row['tolerance']):.2%} 容忍带，按规则降低权益暴露。",
        ]
    if bool(row.get("lower_zone")):
        return 1.0, "fcf_channel_full_buy", [
            f"价格距离下轨 {float(row['distance_to_lower']):.2%}，进入 {float(row['tolerance']):.2%} 容忍带，按规则恢复满仓。",
        ]
    return current_exposure, "fcf_channel_hold", ["价格位于趋势通道中部，维持原仓位。"]


def _signal_label(value: str) -> str:
    labels = {
        "fcf_channel_half_reduce": "上轨半仓",
        "fcf_channel_full_exit": "上轨空仓",
        "fcf_channel_full_buy": "下轨满仓",
        "fcf_channel_hold": "通道内持有",
    }
    return labels.get(value, value)


def _top_candidates(row: pd.Series, target_exposure: float) -> list[dict[str, object]]:
    return [
        {
            "code": "932365.CSI",
            "name": "中证全指自由现金流指数",
            "group": "自由现金流",
            "score": round(float(target_exposure), 6),
            "target_weight": round(float(target_exposure), 6),
            "distance_to_upper": None if pd.isna(row.get("distance_to_upper")) else round(float(row["distance_to_upper"]), 6),
            "distance_to_lower": None if pd.isna(row.get("distance_to_lower")) else round(float(row["distance_to_lower"]), 6),
            "tolerance": round(float(row.get("tolerance", 0.0)), 6),
        },
        {
            "code": "CASH",
            "name": "现金",
            "group": "现金/空仓",
            "score": round(float(1.0 - target_exposure), 6),
            "target_weight": round(float(1.0 - target_exposure), 6),
        },
    ]


def _curve_records(frame: pd.DataFrame, spec: FreeCashFlowTrendSpec) -> list[dict[str, object]]:
    columns = ["date", "strategy_equity", "equal_weight_equity", *[_benchmark_equity_column(code) for code in spec.benchmark_codes]]
    rows = []
    for _, row in frame[columns].iterrows():
        rows.append({key: (str(row[key]) if key == "date" else round(float(row[key]), 6)) for key in columns if key in row})
    return rows


def _return_records(frame: pd.DataFrame, spec: FreeCashFlowTrendSpec) -> list[dict[str, object]]:
    columns = ["date", "strategy_return", "equal_weight_return", "turnover", "target_exposure", *[_benchmark_return_column(code) for code in spec.benchmark_codes]]
    rows = []
    for _, row in frame[columns].iterrows():
        rows.append({key: (str(row[key]) if key == "date" else round(float(row[key]), 8)) for key in columns if key in row})
    return rows


def _indicator_records(frame: pd.DataFrame) -> list[dict[str, object]]:
    columns = [
        "date",
        "index_equity",
        "upper_equity",
        "lower_equity",
        "distance_to_upper",
        "distance_to_lower",
        "tolerance",
        "target_exposure",
    ]
    rows = []
    for _, row in frame[columns].iterrows():
        item: dict[str, object] = {"date": str(row["date"])}
        for column in columns:
            if column == "date":
                continue
            value = row.get(column)
            item[column] = None if pd.isna(value) else round(float(value), 6)
        rows.append(item)
    return rows


def run_free_cash_flow_trend_backtest(
    spec: FreeCashFlowTrendSpec,
    index_history: Mapping[str, pd.DataFrame],
    *,
    start_date: str,
    end_date: str,
    resolved_index_code: str | None = None,
    resolved_index_type: str = "price",
) -> dict[str, object]:
    source_code = resolved_index_code or spec.index_code
    if source_code not in index_history:
        raise ValueError(f"missing free cash flow index history: {source_code}")
    indicator = _build_indicator_frame(index_history[source_code], spec)
    indicator = indicator[(indicator["date"] >= start_date) & (indicator["date"] <= end_date)].copy()
    if indicator.empty:
        raise ValueError("no overlapping free cash flow index dates in backtest window")
    base_close = float(indicator["close"].iloc[0])
    indicator["index_equity"] = indicator["close"].astype(float) / base_close
    indicator["upper_equity"] = indicator["upper_line"].apply(lambda value: None if pd.isna(value) else float(value) / base_close)
    indicator["lower_equity"] = indicator["lower_line"].apply(lambda value: None if pd.isna(value) else float(value) / base_close)

    current_exposure = 1.0
    current_weights = _weights(current_exposure)
    pending_turnover = 0.0
    daily_records: list[dict[str, object]] = []
    signal_records: list[dict[str, object]] = []

    for _, row in indicator.iterrows():
        date_text = str(row["date"])
        benchmark_return = float(row["benchmark_return"])
        strategy_return = current_exposure * benchmark_return
        daily_records.append(
            {
                "date": date_text,
                "strategy_return": strategy_return,
                "equal_weight_return": benchmark_return,
                "turnover": pending_turnover,
                "target_exposure": current_exposure,
                "applied_weights": dict(current_weights),
                _benchmark_return_column(spec.index_code): benchmark_return,
            }
        )
        pending_turnover = 0.0

        target_exposure, signal, drivers = _signal_for_row(row, current_exposure, spec)
        target_weights = _weights(target_exposure)
        turnover = _target_turnover(current_weights, target_weights)
        if turnover > 0:
            signal_records.append(
                {
                    "date": date_text,
                    "apply_from_next_session": True,
                    "strategy_signal": signal,
                    "target_weights": dict(target_weights),
                    "turnover_to_target": turnover,
                    "top_candidates": _top_candidates(row, target_exposure),
                    "rebalance_reason": {
                        "label": _signal_label(signal),
                        "detail": drivers[0] if drivers else _signal_label(signal),
                        "drivers": drivers,
                    },
                }
            )
            pending_turnover = turnover
            current_exposure = target_exposure
            current_weights = target_weights

    frame = pd.DataFrame(daily_records)
    if frame.empty:
        raise ValueError("no free cash flow trend backtest returns generated")
    return_column = _benchmark_return_column(spec.index_code)
    for column in ["strategy_return", "equal_weight_return", return_column]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0.0)
        frame[column.replace("_return", "_equity")] = (1.0 + frame[column]).cumprod()

    indicator_by_date = indicator.set_index("date")
    frame = frame.join(indicator_by_date[[
        "index_equity",
        "upper_equity",
        "lower_equity",
        "distance_to_upper",
        "distance_to_lower",
        "tolerance",
    ]], on="date")

    primary = performance_metrics(frame["strategy_return"], benchmark_returns=frame[return_column], turnover=frame["turnover"])
    strategy_total = compound_return(frame["strategy_return"])
    benchmark_total = compound_return(frame[return_column])
    strategy_drawdown = max_drawdown(frame["strategy_equity"])
    benchmark_drawdown = max_drawdown(frame[_benchmark_equity_column(spec.index_code)])
    latest_signal = signal_records[-1] if signal_records else {}
    average_exposure = float(frame["target_exposure"].mean())
    comparison_assets = [
        {
            "code": spec.index_code,
            "name": "中证全指自由现金流指数",
            "group": "自由现金流基准",
            "label": f"自由现金流指数 {spec.index_code}",
            "total_return": round(benchmark_total, 6),
            "max_drawdown": benchmark_drawdown,
            "return_advantage": round(strategy_total - benchmark_total, 6),
            "drawdown_reduction": round(strategy_drawdown - benchmark_drawdown, 6),
        }
    ]
    summary = {
        "strategy_id": spec.strategy_id,
        "strategy_name": spec.name,
        "short_name": spec.short_name,
        "start_date": str(frame["date"].iloc[0]),
        "end_date": str(frame["date"].iloc[-1]),
        "sessions": int(len(frame)),
        "rebalance_count": len(signal_records),
        "rebalance_every_sessions": 1,
        "strategy_total_return": round(strategy_total, 6),
        "equal_weight_label": "自由现金流指数基准",
        "equal_weight_return": round(benchmark_total, 6),
        "alpha_vs_equal_weight": round(strategy_total - benchmark_total, 6),
        "sharpe": primary["sharpe"],
        "max_drawdown": strategy_drawdown,
        "equal_weight_max_drawdown": benchmark_drawdown,
        "hit_rate_vs_primary_benchmark": primary.get("hit_rate"),
        "average_turnover": primary.get("average_turnover"),
        "cumulative_turnover": primary.get("cumulative_turnover"),
        "average_target_exposure": round(average_exposure, 6),
        "latest_signal": latest_signal.get("strategy_signal"),
        "latest_signal_date": latest_signal.get("date"),
        "latest_weights": latest_signal.get("target_weights", _weights(current_exposure)),
        "comparison_assets": comparison_assets,
        "benchmark_932365_return": round(benchmark_total, 6),
        "benchmark_932365_max_drawdown": benchmark_drawdown,
        "alpha_vs_932365": round(strategy_total - benchmark_total, 6),
    }
    return {
        "metadata": {
            "engine": f"{spec.name} Backtest",
            "strategy_id": spec.strategy_id,
            "description": spec.description,
            "method": spec.method,
            "universe": [
                {"code": asset.code, "name": asset.name, "group": asset.group, "label": asset.label}
                for asset in FREE_CASH_FLOW_UNIVERSE
            ],
            "index_code": spec.index_code,
            "resolved_index_code": source_code,
            "resolved_index_type": resolved_index_type,
            "requested_total_return_code": "932365CNY010.CSI",
            "indicator": "free_cash_flow_trend_channel",
            "return_source": INDEX_RETURN_SOURCE,
            "signal_timing": "Signal is generated after close on date t and applied starting t+1.",
            "no_lookahead_bias": True,
            "evaluation_only": True,
            "no_stock_selection": True,
            "no_trade_execution": True,
            "no_order_generation": True,
            "cash_return_assumption": "Uninvested cash earns 0 in this research version.",
        },
        "summary": summary,
        "performance_metrics": primary,
        "equity_curve": _curve_records(frame, spec),
        "daily_returns": _return_records(frame, spec),
        "indicator_curve": _indicator_records(frame),
        "signals": signal_records,
        "validation": {
            "alpha_positive_vs_equal_weight": summary["alpha_vs_equal_weight"] > 0,
            "alpha_positive_vs_primary_benchmark": (primary.get("excess_return") or 0) > 0,
            "stable_signal_count": len(signal_records),
            "effective_start_after_first_signal": summary["start_date"],
            "trend_channel_signal": True,
            "uses_confirmed_pivots_only": True,
        },
    }
