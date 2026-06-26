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

from config import BREADTH_HISTORY_SAMPLE_SIZE, DATA_DIR, DEFAULT_INDEX_CODE, WEB_PORT
from core.breadth import get_market_daily, get_market_history_sample
from core.data_loader import get_index_daily, normalize_trade_date
from core.exposure_controller import build_exposure_decision
from core.features import build_feature_frame
from core.liquidity import get_moneyflow_hsgt
from core.capital_controller import load_portfolio_policy
from core.execution_policy import load_execution_policy
from core.execution_simulator import simulate_execution_layer
from core.meta_signal_engine import build_meta_edge_signal, load_meta_edge_rules
from core.portfolio_allocator import build_portfolio_allocation
from core.regime_adapter import adapt_regime_payload
from core.risk_score_engine import load_risk_policy
from core.strategy_filter import load_strategy_policy
from core.strategy_router import build_strategy_route
from engine.cycle_detector import detect_current_cycle_track, detect_major_cycles
from engine.market_engine import analyze_index_regime
from engine.regime_explainer import explain_regime


app = FastAPI(title="MyInvestCycle Regime API", version="0.4")
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


def _read_shadow_backtest_payload() -> dict[str, object] | None:
    path = DATA_DIR / "shadow_equity_curve.json"
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else None


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


def _strategy_policy_summary(policy: dict[str, dict[str, object]]) -> dict[str, object]:
    regimes = {}
    for regime in ("bull", "range", "bear", "transition"):
        regime_policy = policy.get(regime, {})
        regimes[regime] = {
            "enabled": regime_policy.get("enabled", []),
            "disabled": regime_policy.get("disabled", []),
        }
    return {
        "risk": policy.get("risk", {}),
        "regimes": regimes,
    }


def _execution_policy_summary(policy: dict[str, dict[str, object]]) -> dict[str, object]:
    regimes = {}
    for regime in ("bull", "range", "bear", "transition"):
        regime_policy = policy.get(regime, {})
        regimes[regime] = {
            "execution_mode": regime_policy.get("execution_mode"),
            "allow": regime_policy.get("allow", []),
            "forbid": regime_policy.get("forbid", []),
        }
    return {
        "risk": policy.get("risk", {}),
        "regimes": regimes,
    }


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
    strategy_policy = load_strategy_policy()
    strategy_route = build_strategy_route(portfolio_allocation, policy=strategy_policy)
    execution_policy = load_execution_policy()
    execution = simulate_execution_layer(strategy_route, policy=execution_policy)
    return {
        "current": current,
        "risk_signal": risk_signal,
        "risk_policy": risk_policy,
        "risk_decision": exposure_decision,
        "portfolio_policy": portfolio_policy,
        "portfolio_allocation": portfolio_allocation,
        "strategy_policy": strategy_policy,
        "strategy_route": strategy_route,
        "execution_policy": execution_policy,
        "execution": execution,
    }


def _system_snapshot_payload(snapshot: dict[str, object]) -> dict[str, object]:
    portfolio = snapshot["portfolio_allocation"]
    strategy_route = snapshot["strategy_route"]
    execution = snapshot["execution"]
    boundaries = {
        "no_stock_selection": portfolio["constraints"]["no_stock_selection"] is True,
        "no_trade_execution": strategy_route["constraints"]["no_trade_execution"] is True,
        "no_real_orders": execution["constraints"]["no_real_orders"] is True,
        "no_broker_connection": execution["constraints"]["no_broker_connection"] is True,
        "simulation_only": execution["constraints"]["simulated_only"] is True,
    }
    policy_locked = (ROOT_DIR / "rules" / "LOCKED_POLICY.md").exists()
    freeze_doc_present = (ROOT_DIR / "docs" / "system_architecture_freeze.md").exists()
    decision_trace_present = (ROOT_DIR / "logs" / "decision_trace.json").exists()
    stable = all(boundaries.values()) and policy_locked and freeze_doc_present and decision_trace_present
    return {
        "status": "stable" if stable else "review_required",
        "as_of": snapshot["current"]["as_of"],
        "layers": 5,
        "execution_mode": "simulation",
        "risk_engine": "active",
        "policy_locked": policy_locked,
        "freeze_doc_present": freeze_doc_present,
        "decision_trace_present": decision_trace_present,
        "boundaries": boundaries,
        "current": {
            "regime": snapshot["risk_signal"]["regime"],
            "risk_level": snapshot["risk_decision"]["risk_level"],
            "total_exposure": portfolio["total_exposure"],
            "enabled_strategies": strategy_route["enabled_strategies"],
            "execution_mode": execution["strategy_mode"],
            "simulated_order_count": execution["constraints"]["order_count"],
        },
        "artifacts": {
            "architecture_freeze": "docs/system_architecture_freeze.md",
            "decision_trace": "logs/decision_trace.json",
            "policy_lock": "rules/LOCKED_POLICY.md",
            "integrity_check": "scripts/system_integrity_check.py",
        },
    }


def _meta_edge_payload(snapshot: dict[str, object]) -> dict[str, object]:
    return build_meta_edge_signal(
        regime_signal=snapshot["risk_signal"],
        risk_decision=snapshot["risk_decision"],
        portfolio=snapshot["portfolio_allocation"],
        strategy_route=snapshot["strategy_route"],
        hazard_rows=_read_data_json("structural_hazard_dataset.json") or [],
        survival_rows=_read_data_json("structural_survival_dataset.json") or [],
        rules=load_meta_edge_rules(),
    )


def _api_endpoint(
    method: str,
    path: str,
    description: str,
    returns: str,
    params: list[dict[str, str]] | None = None,
    freshness: str = "current",
    safety: str = "read-only",
) -> dict[str, object]:
    return {
        "method": method,
        "path": path,
        "description": description,
        "params": params or [],
        "returns": returns,
        "freshness": freshness,
        "safety": safety,
    }


def _api_catalog_payload() -> dict[str, object]:
    groups = [
        {
            "name": "Web 与接口文档",
            "description": "页面入口、接口目录和自动生成文档。",
            "endpoints": [
                _api_endpoint("GET", "/", "打开当前系统首页。", "HTML dashboard", freshness="page"),
                _api_endpoint("GET", "/api", "返回当前系统所有主要接口、用途、参数和边界说明。", "API catalog"),
                _api_endpoint("GET", "/docs", "打开 FastAPI 交互式接口文档。", "Swagger UI", freshness="docs"),
                _api_endpoint("GET", "/redoc", "打开 ReDoc 接口文档。", "ReDoc HTML", freshness="docs"),
                _api_endpoint("GET", "/openapi.json", "返回机器可读 OpenAPI 规范。", "OpenAPI schema", freshness="docs"),
                _api_endpoint("GET", "/api/health", "服务健康检查。", "status"),
            ],
        },
        {
            "name": "市场状态识别",
            "description": "读取当前市场状态、四维评分、解释和历史序列。",
            "endpoints": [
                _api_endpoint("GET", "/api/regime/current", "当前 A 股牛熊状态、置信度和四维评分。", "current regime"),
                _api_endpoint("GET", "/api/features/latest", "当前最新四维特征分数。", "latest feature scores"),
                _api_endpoint("GET", "/api/regime/explain", "当前状态识别的文字解释。", "regime explanation"),
                _api_endpoint(
                    "GET",
                    "/api/regime/history",
                    "指定时间段内的状态序列，最多 80 个交易日。",
                    "history items",
                    params=[
                        {"name": "start", "required": "true", "format": "YYYYMMDD"},
                        {"name": "end", "required": "true", "format": "YYYYMMDD"},
                    ],
                ),
            ],
        },
        {
            "name": "牛熊周期观察",
            "description": "长期周期切分、本轮周期跟踪和概率展望。",
            "endpoints": [
                _api_endpoint("GET", "/api/regime/cycle", "长期牛熊主周期、指数序列和周期主题块。", "major cycle analysis"),
                _api_endpoint("GET", "/api/regime/cycle/track", "本轮周期起点、当前位置、关键均线和概率展望。", "current cycle track"),
            ],
        },
        {
            "name": "组合与策略模拟",
            "description": "从风险状态到组合、策略路由和执行模拟的只读决策链。",
            "endpoints": [
                _api_endpoint("GET", "/api/portfolio/current", "当前组合仓位、现金比例和策略资金分配。", "portfolio allocation"),
                _api_endpoint("GET", "/api/strategy/current", "当前可启用策略、禁用策略和策略预算。", "strategy route"),
                _api_endpoint("GET", "/api/execution/current", "执行意图和模拟指令，不产生真实订单。", "execution simulation"),
            ],
        },
        {
            "name": "Small Edge Meta Signal",
            "description": "检测风控、组合、策略和结构风险之间的内部矛盾，不预测收益、不选股。",
            "endpoints": [
                _api_endpoint("GET", "/api/meta-edge/current", "当前 Meta Signal Engine v1 快照。", "meta edge signal"),
            ],
        },
        {
            "name": "影子账户评估",
            "description": "用历史 R2 仓位信号回放 510500 基准收益，评估系统相对基准的收益、回撤和 Alpha。",
            "endpoints": [
                _api_endpoint(
                    "GET",
                    "/api/shadow/current",
                    "返回 S1.1 影子账户与 510500 基准的完整权益曲线、收益序列和 Alpha。",
                    "shadow portfolio backtest",
                    freshness="generated artifact",
                ),
            ],
        },
        {
            "name": "系统成果总览",
            "description": "系统冻结状态、完整成果和研究验证摘要。",
            "endpoints": [
                _api_endpoint("GET", "/api/system/snapshot", "系统边界、冻结文档、策略锁定和当前状态快照。", "system snapshot"),
                _api_endpoint("GET", "/api/results/summary", "页面使用的完整成果汇总，包括风控、组合、策略、执行和验证结论。", "results summary"),
            ],
        },
    ]
    total_endpoints = sum(len(group["endpoints"]) for group in groups)
    return {
        "name": "MyInvestCycle API",
        "version": app.version,
        "status": "stable",
        "description": "A股牛熊周期识别、风险控制、组合配置、策略路由与执行模拟的只读接口目录。",
        "base_url": "http://127.0.0.1:8021",
        "web_dashboard": "/",
        "docs": {
            "interactive": "/docs",
            "redoc": "/redoc",
            "openapi": "/openapi.json",
        },
        "recommended_entrypoints": [
            {"path": "/api", "description": "先看接口目录。"},
            {"path": "/api/results/summary", "description": "读取系统全部成果汇总。"},
            {"path": "/api/system/snapshot", "description": "读取系统冻结边界与稳定状态。"},
            {"path": "/api/regime/current", "description": "读取当前牛熊状态与四维评分。"},
            {"path": "/api/regime/cycle/track", "description": "读取本轮周期位置和概率展望。"},
            {"path": "/api/meta-edge/current", "description": "读取系统内部矛盾信号。"},
            {"path": "/api/shadow/current", "description": "读取影子账户与 510500 基准评估。"},
        ],
        "safety": {
            "read_only": True,
            "no_stock_selection": True,
            "no_trade_execution": True,
            "no_real_orders": True,
            "no_broker_connection": True,
            "simulation_only": True,
        },
        "groups": groups,
        "total_endpoints": total_endpoints,
    }


@app.get("/api")
def api_catalog() -> dict:
    return _api_catalog_payload()


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
            "strategy_route": snapshot["strategy_route"],
            "policy": _portfolio_policy_summary(snapshot["portfolio_policy"]),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/strategy/current")
def strategy_current() -> dict:
    try:
        snapshot = _current_portfolio_snapshot()
        return {
            "as_of": snapshot["current"]["as_of"],
            "portfolio": snapshot["portfolio_allocation"],
            "strategy_route": snapshot["strategy_route"],
            "execution": snapshot["execution"],
            "policy": _strategy_policy_summary(snapshot["strategy_policy"]),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/execution/current")
def execution_current() -> dict:
    try:
        snapshot = _current_portfolio_snapshot()
        return {
            "as_of": snapshot["current"]["as_of"],
            "strategy_route": snapshot["strategy_route"],
            "execution": snapshot["execution"],
            "policy": _execution_policy_summary(snapshot["execution_policy"]),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/meta-edge/current")
def meta_edge_current() -> dict:
    try:
        snapshot = _current_portfolio_snapshot()
        return _meta_edge_payload(snapshot)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/shadow/current")
def shadow_current() -> dict:
    payload = _read_shadow_backtest_payload()
    if payload is None:
        raise HTTPException(
            status_code=503,
            detail="shadow backtest artifact missing; run scripts/run_shadow_backtest.py first.",
        )
    return payload


@app.get("/api/system/snapshot")
def system_snapshot() -> dict:
    try:
        snapshot = _current_portfolio_snapshot()
        return _system_snapshot_payload(snapshot)
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
        strategy_policy = snapshot["strategy_policy"]
        strategy_route = snapshot["strategy_route"]
        execution_policy = snapshot["execution_policy"]
        execution = snapshot["execution"]
        system_snapshot_payload = _system_snapshot_payload(snapshot)
        meta_edge = _meta_edge_payload(snapshot)
        shadow_backtest = _read_shadow_backtest_payload()

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
            "strategy_route": {
                "route": strategy_route,
                "policy": _strategy_policy_summary(strategy_policy),
            },
            "execution": {
                "simulation": execution,
                "policy": _execution_policy_summary(execution_policy),
            },
            "meta_edge": meta_edge,
            "shadow_backtest": shadow_backtest,
            "system": system_snapshot_payload,
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
                "FINAL 已冻结系统边界：5 层决策链稳定，策略已锁定，执行层保持 simulation-only。",
                "R3.1 已把策略路由转成执行意图和模拟指令，但不连接券商、不生成真实订单。",
                "M1.1 已新增 Meta Signal Engine，只检测系统内部矛盾信号，不预测收益、不选股、不改变既有风控链路。",
                "S1.1 已新增影子账户评估，用历史 R2 仓位回放 510500 基准收益，输出权益曲线、Alpha 和回撤。",
                "R2.2 已把组合配置转译为策略可执行约束，页面展示可启用策略、禁用原因和策略预算。",
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
