from __future__ import annotations

from typing import Mapping

import pandas as pd

from core.alpha_validation_engine import benchmark_comparison, compound_return, max_drawdown, performance_metrics, regime_breakdown
from core.etf_return_utils import coerce_price_frame, daily_return_series
from core.etf_rotation_signal_engine import build_etf_rotation_signal
from core.etf_universe_builder import build_etf_universe
from core.exposure_controller import build_exposure_decision
from core.risk_score_engine import load_risk_policy
from core.shadow_portfolio_engine import risk_signal_from_survival_row
from core.style_factor_engine import build_style_factor_snapshot


BENCHMARK_CODES = ("510500.SH", "510300.SH")
REGIME_LABELS = {
    "bull": "牛市",
    "bear": "熊市",
    "range": "震荡",
    "transition": "过渡",
}


def _regime_label(value: object) -> str:
    return REGIME_LABELS.get(str(value), str(value or "--"))


def _style_label(value: str) -> str:
    labels = {
        "growth": "成长/科技",
        "value": "价值/大盘",
        "low_vol": "红利/低波",
        "dividend": "红利/低波",
        "small_cap": "中小盘",
        "cash_proxy": "现金/债券代理",
    }
    return labels.get(value, value or "--")


def _signal_label(value: object) -> str:
    text = str(value or "")
    if text == "hold_universe":
        return "保持观察池"
    if text == "insufficient_data":
        return "样本不足"
    if text.startswith("rotate_to_"):
        return f"转向{_style_label(text.replace('rotate_to_', ''))}"
    return text or "--"


def _coerce_price_frame(frame: pd.DataFrame) -> pd.DataFrame:
    return coerce_price_frame(frame)


def _returns_matrix(price_history: Mapping[str, pd.DataFrame]) -> pd.DataFrame:
    returns: dict[str, pd.Series] = {}
    for code, frame in price_history.items():
        prices = _coerce_price_frame(frame)
        if prices.empty:
            continue
        returns[code] = daily_return_series(prices)
    if not returns:
        raise ValueError("no ETF price history available for backtest")
    return pd.DataFrame(returns).sort_index()


def _price_history_until(price_history: Mapping[str, pd.DataFrame], date_text: str, lookback_sessions: int) -> dict[str, pd.DataFrame]:
    result: dict[str, pd.DataFrame] = {}
    for code, frame in price_history.items():
        prices = _coerce_price_frame(frame)
        sliced = prices[prices["trade_date"] <= date_text].tail(lookback_sessions).copy()
        if not sliced.empty:
            result[code] = sliced
    return result


def _target_turnover(previous: Mapping[str, float], current: Mapping[str, float]) -> float:
    keys = set(previous) | set(current)
    previous_cash = 1.0 - sum(float(value) for value in previous.values())
    current_cash = 1.0 - sum(float(value) for value in current.values())
    turnover = abs(previous_cash - current_cash)
    turnover += sum(abs(float(current.get(key, 0.0)) - float(previous.get(key, 0.0))) for key in keys)
    return round(turnover / 2.0, 6)


def _largest_weight_changes(previous: Mapping[str, float], current: Mapping[str, float]) -> list[dict[str, object]]:
    changes = []
    for code in sorted(set(previous) | set(current)):
        previous_weight = float(previous.get(code, 0.0))
        current_weight = float(current.get(code, 0.0))
        change = current_weight - previous_weight
        if abs(change) < 0.0005:
            continue
        changes.append(
            {
                "code": code,
                "previous_weight": round(previous_weight, 6),
                "current_weight": round(current_weight, 6),
                "change": round(change, 6),
            }
        )
    return sorted(changes, key=lambda item: abs(float(item["change"])), reverse=True)[:3]


def _rebalance_reason(
    previous_weights: Mapping[str, float],
    current_weights: Mapping[str, float],
    previous_signal: Mapping[str, object] | None,
    current_signal: Mapping[str, object],
    turnover: float,
) -> dict[str, object]:
    previous_regime = previous_signal.get("regime") if previous_signal else None
    current_regime = current_signal.get("regime")
    previous_rotation = previous_signal.get("rebalance_signal") if previous_signal else None
    current_rotation = current_signal.get("rebalance_signal")
    changes = _largest_weight_changes(previous_weights, current_weights)

    if previous_signal is None:
        category = "initial_position"
        label = "首次建仓"
        detail = "首个可用轮动信号，建立 ETF 目标组合。"
    elif previous_regime != current_regime:
        category = "regime_change"
        label = "状态切换"
        detail = f"市场状态由{_regime_label(previous_regime)}切到{_regime_label(current_regime)}，目标 ETF 池同步调整。"
    elif turnover >= 0.20:
        category = "same_regime_major_rebalance"
        label = "同状态大幅再平衡"
        detail = "市场状态未变，但 ETF 相对强弱、稳定性或风险权重变化较大。"
    elif turnover >= 0.05:
        category = "same_regime_rebalance"
        label = "同状态再平衡"
        detail = "市场状态未变，按最近 ETF 强弱和风险分数调整权重。"
    else:
        category = "same_regime_minor_adjustment"
        label = "同状态微调"
        detail = "市场状态未变，仅做小幅权重修正。"

    drivers = []
    if previous_signal is not None:
        drivers.append(f"状态：{_regime_label(previous_regime)} -> {_regime_label(current_regime)}")
    else:
        drivers.append(f"状态：{_regime_label(current_regime)}")
    if previous_rotation != current_rotation:
        drivers.append(f"方向：{_signal_label(previous_rotation)} -> {_signal_label(current_rotation)}")
    else:
        drivers.append(f"方向：{_signal_label(current_rotation)}")
    if changes:
        drivers.append(
            "主要权重变化："
            + "，".join(
                f"{item['code']} {float(item['change']) * 100:+.1f}pct"
                for item in changes
            )
        )

    return {
        "category": category,
        "label": label,
        "detail": detail,
        "drivers": drivers,
        "weight_changes": changes,
    }


def _row_signal(
    row: Mapping[str, object],
    price_history: Mapping[str, pd.DataFrame],
    *,
    risk_policy: Mapping[str, object],
    regime_field: str,
    lookback_sessions: int,
) -> dict[str, object]:
    signal = risk_signal_from_survival_row(row, regime_field=regime_field)
    risk_decision = build_exposure_decision(signal, policy=risk_policy)
    style_snapshot = build_style_factor_snapshot(signal, risk_decision)
    etf_universe = build_etf_universe(style_snapshot)
    historical_prices = _price_history_until(price_history, str(signal["as_of"]), lookback_sessions)
    rotation_signal = build_etf_rotation_signal(style_snapshot, etf_universe, historical_prices)
    rotation_signal["risk_score"] = risk_decision["risk_score"]
    return rotation_signal


def _curve_records(frame: pd.DataFrame) -> list[dict[str, object]]:
    columns = [
        "date",
        "rotation_equity",
        "benchmark_510500_equity",
        "benchmark_510300_equity",
        "equal_weight_basket_equity",
        "alpha_510500",
    ]
    return [
        {
            key: (str(row[key]) if key == "date" else round(float(row[key]), 6))
            for key in columns
            if key in row
        }
        for _, row in frame[columns].iterrows()
    ]


def _return_records(frame: pd.DataFrame) -> list[dict[str, object]]:
    columns = [
        "date",
        "regime",
        "rotation_return",
        "benchmark_510500_return",
        "benchmark_510300_return",
        "equal_weight_basket_return",
        "turnover",
    ]
    return [
        {
            key: (str(row[key]) if key in {"date", "regime"} else round(float(row[key]), 8))
            for key in columns
            if key in row
        }
        for _, row in frame[columns].iterrows()
    ]


def run_etf_rotation_backtest(
    survival_rows: list[dict[str, object]],
    price_history: Mapping[str, pd.DataFrame],
    *,
    start_date: str,
    end_date: str,
    regime_field: str = "raw_regime",
    rebalance_every_sessions: int = 20,
    lookback_sessions: int = 260,
) -> dict[str, object]:
    risk_policy = load_risk_policy()
    rows_by_date = {
        str(row["date"]): row
        for row in survival_rows
        if isinstance(row, dict) and row.get("date") and start_date <= str(row["date"]) <= end_date
    }
    returns = _returns_matrix(price_history)
    dates = sorted(date for date in returns.index.astype(str) if start_date <= date <= end_date and date in rows_by_date)
    if not dates:
        raise ValueError("no overlapping dates between survival rows and ETF returns")

    current_weights: dict[str, float] = {}
    current_signal: dict[str, object] | None = None
    pending_turnover = 0.0
    last_rebalance_index = -max(1, rebalance_every_sessions)
    daily_records: list[dict[str, object]] = []
    signal_records: list[dict[str, object]] = []

    for index, date_text in enumerate(dates):
        day_returns = returns.loc[date_text].fillna(0.0)
        if current_weights and current_signal is not None:
            rotation_return = sum(float(weight) * float(day_returns.get(code, 0.0)) for code, weight in current_weights.items())
            equal_weight_return = float(day_returns[[code for code in price_history if code in day_returns.index]].mean())
            daily_records.append(
                {
                    "date": date_text,
                    "regime": current_signal.get("regime"),
                    "rotation_return": rotation_return,
                    "benchmark_510500_return": float(day_returns.get("510500.SH", 0.0)),
                    "benchmark_510300_return": float(day_returns.get("510300.SH", 0.0)),
                    "equal_weight_basket_return": equal_weight_return,
                    "turnover": pending_turnover,
                    "applied_weights": dict(current_weights),
                    "signal_confidence": (current_signal.get("confidence") or {}).get("score"),
                    "rebalance_signal": current_signal.get("rebalance_signal"),
                }
            )
            pending_turnover = 0.0

        should_rebalance = index - last_rebalance_index >= max(1, rebalance_every_sessions)
        if should_rebalance:
            signal = _row_signal(
                rows_by_date[date_text],
                price_history,
                risk_policy=risk_policy,
                regime_field=regime_field,
                lookback_sessions=lookback_sessions,
            )
            new_weights = {str(code): float(weight) for code, weight in signal.get("etf_target_weights", {}).items()}
            if new_weights:
                pending_turnover = _target_turnover(current_weights, new_weights)
                rebalance_reason = _rebalance_reason(
                    current_weights,
                    new_weights,
                    current_signal,
                    signal,
                    pending_turnover,
                )
                current_weights = new_weights
                current_signal = signal
                last_rebalance_index = index
                signal_records.append(
                    {
                        "date": date_text,
                        "apply_from_next_session": True,
                        "regime": signal.get("regime"),
                        "rebalance_signal": signal.get("rebalance_signal"),
                        "confidence": signal.get("confidence"),
                        "target_weights": new_weights,
                        "top_candidates": signal.get("top_candidates", [])[:4],
                        "turnover_to_target": pending_turnover,
                        "rebalance_reason": rebalance_reason,
                    }
                )

    frame = pd.DataFrame(daily_records)
    if frame.empty:
        raise ValueError("no backtest returns generated; check ETF history and signal windows")

    for column in (
        "rotation_return",
        "benchmark_510500_return",
        "benchmark_510300_return",
        "equal_weight_basket_return",
    ):
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0.0)

    frame["rotation_equity"] = (1.0 + frame["rotation_return"]).cumprod()
    frame["benchmark_510500_equity"] = (1.0 + frame["benchmark_510500_return"]).cumprod()
    frame["benchmark_510300_equity"] = (1.0 + frame["benchmark_510300_return"]).cumprod()
    frame["equal_weight_basket_equity"] = (1.0 + frame["equal_weight_basket_return"]).cumprod()
    frame["alpha_510500"] = frame["rotation_equity"] - frame["benchmark_510500_equity"]

    comparison = benchmark_comparison(
        frame,
        benchmark_columns=[
            "benchmark_510500_return",
            "benchmark_510300_return",
            "equal_weight_basket_return",
        ],
    )
    primary = performance_metrics(
        frame["rotation_return"],
        benchmark_returns=frame["benchmark_510500_return"],
        turnover=frame["turnover"],
    )
    rotation_total = compound_return(frame["rotation_return"])
    benchmark_510500_total = compound_return(frame["benchmark_510500_return"])
    benchmark_510300_total = compound_return(frame["benchmark_510300_return"])
    equal_weight_total = compound_return(frame["equal_weight_basket_return"])

    summary = {
        "start_date": str(frame["date"].iloc[0]),
        "end_date": str(frame["date"].iloc[-1]),
        "sessions": int(len(frame)),
        "rebalance_count": len(signal_records),
        "rebalance_every_sessions": max(1, rebalance_every_sessions),
        "rotation_total_return": round(rotation_total, 6),
        "benchmark_510500_return": round(benchmark_510500_total, 6),
        "benchmark_510300_return": round(benchmark_510300_total, 6),
        "equal_weight_basket_return": round(equal_weight_total, 6),
        "alpha_vs_510500": round(rotation_total - benchmark_510500_total, 6),
        "alpha_vs_510300": round(rotation_total - benchmark_510300_total, 6),
        "alpha_vs_equal_weight": round(rotation_total - equal_weight_total, 6),
        "sharpe": primary["sharpe"],
        "max_drawdown": max_drawdown(frame["rotation_equity"]),
        "benchmark_510500_max_drawdown": max_drawdown(frame["benchmark_510500_equity"]),
        "benchmark_510300_max_drawdown": max_drawdown(frame["benchmark_510300_equity"]),
        "equal_weight_basket_max_drawdown": max_drawdown(frame["equal_weight_basket_equity"]),
        "hit_rate_vs_510500": primary.get("hit_rate"),
        "average_turnover": primary.get("average_turnover"),
        "cumulative_turnover": primary.get("cumulative_turnover"),
    }

    return {
        "metadata": {
            "engine": "ETF Rotation Backtest & Alpha Validation A1.3",
            "regime_field": regime_field,
            "return_source": "Tushare fund_daily ETF quote returns; prefer pct_chg, then close/pre_close, with close pct_change only as fallback.",
            "no_lookahead_bias": True,
            "signal_timing": "Signal is generated after close on date t and applied starting t+1.",
            "evaluation_only": True,
            "no_stock_selection": True,
            "no_trade_execution": True,
            "no_order_generation": True,
        },
        "summary": summary,
        "performance_metrics": primary,
        "benchmark_comparison": comparison,
        "regime_breakdown": regime_breakdown(frame),
        "equity_curve": _curve_records(frame),
        "daily_returns": _return_records(frame),
        "signals": signal_records,
        "validation": {
            "alpha_positive_vs_510500": summary["alpha_vs_510500"] > 0,
            "alpha_positive_vs_510300": summary["alpha_vs_510300"] > 0,
            "alpha_positive_vs_equal_weight": summary["alpha_vs_equal_weight"] > 0,
            "stable_signal_count": len(signal_records),
            "effective_start_after_first_signal": summary["start_date"],
        },
    }
