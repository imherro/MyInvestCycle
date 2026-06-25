from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import date
from functools import lru_cache
from pathlib import Path
from statistics import mean

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from config import BREADTH_HISTORY_SAMPLE_SIZE, DEFAULT_INDEX_CODE, WEB_PORT
from core.breadth import get_market_daily, get_market_history_sample
from core.data_loader import get_index_daily, normalize_trade_date
from core.exposure_controller import build_exposure_decision
from core.features import build_feature_frame
from core.liquidity import get_moneyflow_hsgt
from core.capital_controller import load_portfolio_policy
from core.portfolio_allocator import build_portfolio_allocation
from core.regime_adapter import adapt_regime_payload
from core.risk_score_engine import load_risk_policy
from engine.cycle_detector import detect_current_cycle_track, detect_major_cycles
from engine.market_engine import analyze_index_regime
from engine.regime_explainer import explain_regime


app = FastAPI(title="MyInvestCycle Regime API", version="0.3")
app.mount("/static", StaticFiles(directory=ROOT_DIR / "web" / "static"), name="static")


def _calendar_shift(date_text: str, days: int) -> str:
    return (pd.to_datetime(date_text, format="%Y%m%d") + pd.Timedelta(days=days)).strftime("%Y%m%d")


def _today_text() -> str:
    return date.today().strftime("%Y%m%d")


def _load_index_window(start_date: str, end_date: str):
    df = get_index_daily(DEFAULT_INDEX_CODE, start_date, end_date)
    if df.empty:
        raise HTTPException(status_code=503, detail="No index data returned from Tushare.")
    return df


@lru_cache(maxsize=2)
def _load_cycle_index(end_date: str):
    return get_index_daily(DEFAULT_INDEX_CODE, "19940101", end_date)


def _load_hsgt_for_index(index_df, as_of: str):
    window = index_df[index_df["trade_date"] <= as_of].tail(30)
    if window.empty:
        return None
    try:
        return get_moneyflow_hsgt(str(window["trade_date"].iloc[0]), as_of)
    except Exception:
        return None


def _read_data_json(file_name: str):
    path = ROOT_DIR / "data" / file_name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _event_summary(rows: list[dict], event_key: str = "label") -> dict[str, object]:
    observations = len(rows)
    events = sum(1 for row in rows if int(row.get(event_key, 0)) == 1)
    return {
        "observations": observations,
        "events": events,
        "non_events": observations - events,
        "event_rate": round(events / observations, 6) if observations else None,
    }


def _regime_counts(rows: list[dict], regime_key: str) -> dict[str, int]:
    return dict(Counter(str(row.get(regime_key, "unknown")) for row in rows))


def _duration_summary(rows: list[dict], regime_key: str) -> dict[str, object]:
    grouped: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        regime = str(row.get(regime_key, "unknown"))
        grouped[regime].append(int(row.get("duration", 0)))

    regimes = {}
    for regime, durations in sorted(grouped.items()):
        regimes[regime] = {
            "observations": len(durations),
            "max_duration": max(durations) if durations else 0,
            "avg_duration": round(mean(durations), 2) if durations else 0,
        }
    return regimes


def _model_validation_summary(report: dict | None) -> dict[str, object] | None:
    if not report:
        return None
    evaluation = report.get("evaluation", {})
    model = evaluation.get("model", {})
    baselines = evaluation.get("baselines", {})
    volatility = baselines.get("volatility_only", {})
    random_baseline = baselines.get("random", {})
    baseline_gap = evaluation.get("baseline_gap", {})
    return {
        "metadata": report.get("metadata", {}),
        "split": report.get("split", {}),
        "model": {
            "roc_auc": model.get("roc_auc"),
            "precision": model.get("precision"),
            "recall": model.get("recall"),
            "lift_vs_random": model.get("lift_vs_random"),
        },
        "random_baseline": {
            "roc_auc": random_baseline.get("roc_auc"),
            "precision": random_baseline.get("precision"),
        },
        "volatility_only": {
            "roc_auc": volatility.get("roc_auc"),
            "precision": volatility.get("precision"),
            "recall": volatility.get("recall"),
            "lift_vs_random": volatility.get("lift_vs_random"),
        },
        "baseline_gap": baseline_gap,
    }


def _policy_summary(policy: dict[str, dict[str, object]]) -> dict[str, object]:
    regimes = {}
    for regime in ("bull", "range", "bear", "transition"):
        regime_policy = policy.get(regime, {})
        regimes[regime] = {
            "base_exposure": regime_policy.get("base_exposure"),
            "min_exposure": regime_policy.get("min_exposure"),
            "max_exposure": regime_policy.get("max_exposure"),
            "leverage_allowed": regime_policy.get("leverage_allowed"),
            "strategy_mode": regime_policy.get("strategy_mode"),
        }
    return {"risk": policy.get("risk", {}), "regimes": regimes}


def _portfolio_policy_summary(policy: dict[str, dict[str, object]]) -> dict[str, object]:
    regimes = {}
    for regime in ("bull", "range", "bear", "transition"):
        regime_policy = policy.get(regime, {})
        regimes[regime] = {
            "base_exposure": regime_policy.get("base_exposure"),
            "max_exposure": regime_policy.get("max_exposure"),
            "min_cash": regime_policy.get("min_cash"),
            "strategy_allocation": regime_policy.get("strategy_allocation", {}),
        }
    return {"regimes": regimes}


def _current_regime_payload() -> dict:
    end_date = _today_text()
    start_date = _calendar_shift(end_date, -540)
    index_df = _load_index_window(start_date, end_date)
    as_of = str(index_df["trade_date"].iloc[-1])
    market_daily = get_market_daily(as_of)
    history_start = _calendar_shift(as_of, -370)
    market_history = get_market_history_sample(
        market_daily,
        history_start,
        as_of,
        sample_size=BREADTH_HISTORY_SAMPLE_SIZE,
    )
    hsgt = _load_hsgt_for_index(index_df, as_of)
    return analyze_index_regime(
        index_df,
        market_daily_df=market_daily,
        market_history_df=market_history,
        hsgt_df=hsgt,
    )


def _current_portfolio_snapshot() -> dict[str, object]:
    current = _current_regime_payload()
    risk_signal = adapt_regime_payload(current)
    risk_policy = load_risk_policy()
    exposure_decision = build_exposure_decision(risk_signal, policy=risk_policy)
    portfolio_policy = load_portfolio_policy()
    portfolio_allocation = build_portfolio_allocation(
        {"input": risk_signal, "decision": exposure_decision},
        policy=portfolio_policy,
    )
    return {
        "current": current,
        "risk_signal": risk_signal,
        "risk_policy": risk_policy,
        "risk_decision": exposure_decision,
        "portfolio_policy": portfolio_policy,
        "portfolio_allocation": portfolio_allocation,
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def dashboard():
    return FileResponse(ROOT_DIR / "web" / "templates" / "dashboard.html")


@app.get("/api/regime/current")
def regime_current() -> dict:
    try:
        return _current_regime_payload()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/features/latest")
def features_latest() -> dict:
    payload = regime_current()
    return {
        "as_of": payload["as_of"],
        "trend_score": payload["trend_score"],
        "breadth_score": payload["breadth_score"],
        "liquidity_score": payload["liquidity_score"],
        "volatility_score": payload["volatility_score"],
        "sub_scores": payload["sub_scores"],
    }


@app.get("/api/regime/explain")
def regime_explain() -> dict:
    return explain_regime(regime_current())


@app.get("/api/regime/cycle")
def regime_cycle() -> dict:
    try:
        index_df = _load_cycle_index(_today_text())
        return detect_major_cycles(index_df)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/regime/cycle/track")
def regime_cycle_track() -> dict:
    try:
        index_df = _load_cycle_index(_today_text())
        return detect_current_cycle_track(index_df)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/portfolio/current")
def portfolio_current() -> dict:
    try:
        snapshot = _current_portfolio_snapshot()
        return {
            "as_of": snapshot["current"]["as_of"],
            "input": snapshot["risk_signal"],
            "risk_decision": snapshot["risk_decision"],
            "portfolio": snapshot["portfolio_allocation"],
            "policy": _portfolio_policy_summary(snapshot["portfolio_policy"]),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/results/summary")
def results_summary() -> dict:
    try:
        snapshot = _current_portfolio_snapshot()
        current = snapshot["current"]
        risk_signal = snapshot["risk_signal"]
        exposure_decision = snapshot["risk_decision"]
        policy = snapshot["risk_policy"]
        portfolio_policy = snapshot["portfolio_policy"]
        portfolio_allocation = snapshot["portfolio_allocation"]

        hazard_rows = _read_data_json("hazard_dataset.json") or []
        structural_hazard_rows = _read_data_json("structural_hazard_dataset.json") or []
        survival_rows = _read_data_json("survival_dataset.json") or []
        structural_survival_rows = _read_data_json("structural_survival_dataset.json") or []
        model_evaluation = _read_data_json("hazard_model_evaluation.json")
        model_sensitivity = _read_data_json("hazard_model_sensitivity.json")

        hazard_raw = _event_summary(hazard_rows)
        hazard_structural = _event_summary(structural_hazard_rows)
        survival_raw = _event_summary(survival_rows, event_key="event")
        survival_structural = _event_summary(structural_survival_rows, event_key="event")

        return {
            "as_of": current["as_of"],
            "risk": {
                "signal": risk_signal,
                "decision": exposure_decision,
                "policy": _policy_summary(policy),
            },
            "portfolio": {
                "allocation": portfolio_allocation,
                "policy": _portfolio_policy_summary(portfolio_policy),
            },
            "hazard": {
                "raw": {
                    **hazard_raw,
                    "regime_counts": _regime_counts(hazard_rows, "regime"),
                },
                "structural": {
                    **hazard_structural,
                    "regime_counts": _regime_counts(structural_hazard_rows, "structural_regime"),
                    "label_types": dict(Counter(str(row.get("label_type", "unknown")) for row in structural_hazard_rows)),
                },
            },
            "survival": {
                "raw": {
                    **survival_raw,
                    "durations": _duration_summary(survival_rows, "regime"),
                },
                "structural": {
                    **survival_structural,
                    "durations": _duration_summary(structural_survival_rows, "structural_regime"),
                },
            },
            "model_validation": {
                "default": _model_validation_summary(model_evaluation),
                "sensitivity": (model_sensitivity or {}).get("summary", {}),
            },
            "conclusions": [
                "R2.1 已把风险引擎输出落到组合层，页面展示总仓位、现金比例和策略资金分配。",
                "结构化事件标签把原始频繁跳变压缩为更接近主周期切换的样本，适合做风险观察而不是短线交易信号。",
                "默认结构化模型相对随机基准有正向识别力，但敏感性测试不稳定，不能直接解释为确定性预测。",
                "波动单因子在默认切分中强于多因子逻辑模型，说明当前阶段的风险提示主要来自波动与市场宽度压力。",
                "最终落地结果是按牛熊状态调节仓位与交易模式的风控层，而不是自动买卖或收益承诺。",
            ],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/regime/history")
def regime_history(
    start: str = Query(..., description="YYYYMMDD"),
    end: str = Query(..., description="YYYYMMDD"),
) -> dict:
    try:
        start_date = normalize_trade_date(start)
        end_date = normalize_trade_date(end)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if start_date > end_date:
        raise HTTPException(status_code=422, detail="start must be earlier than or equal to end")

    warmup_start = _calendar_shift(start_date, -540)
    index_df = _load_index_window(warmup_start, end_date)
    target_dates = index_df[
        (index_df["trade_date"] >= start_date) & (index_df["trade_date"] <= end_date)
    ]["trade_date"].astype(str).tolist()

    if len(target_dates) > 80:
        raise HTTPException(status_code=422, detail="history range is limited to 80 trading days")

    series = []
    for trade_date in target_dates:
        index_slice = index_df[index_df["trade_date"] <= trade_date]
        market_daily = get_market_daily(trade_date)
        market_history = get_market_history_sample(
            market_daily,
            _calendar_shift(trade_date, -370),
            trade_date,
            sample_size=BREADTH_HISTORY_SAMPLE_SIZE,
        )
        hsgt = _load_hsgt_for_index(index_df, trade_date)
        result = analyze_index_regime(
            index_slice,
            market_daily_df=market_daily,
            market_history_df=market_history,
            hsgt_df=hsgt,
        )
        feature_row = build_feature_frame(index_slice).iloc[-1]
        series.append(
            {
                "as_of": result["as_of"],
                "regime": result["regime"],
                "confidence": result["confidence"],
                "regime_score": result["regime_score"],
                "sub_scores": result["sub_scores"],
                "index": {
                    "close": round(float(feature_row["close"]), 4),
                    "ma120": None if pd.isna(feature_row["ma120"]) else round(float(feature_row["ma120"]), 4),
                },
            }
        )

    return {"start": start_date, "end": end_date, "items": series}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("web.app:app", host="127.0.0.1", port=WEB_PORT, reload=False)
