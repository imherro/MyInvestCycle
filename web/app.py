from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Query

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from config import BREADTH_HISTORY_SAMPLE_SIZE, DEFAULT_INDEX_CODE, WEB_PORT
from core.breadth import get_market_daily, get_market_history_sample
from core.data_loader import get_index_daily, normalize_trade_date
from core.liquidity import get_moneyflow_hsgt
from engine.market_engine import analyze_index_regime


app = FastAPI(title="MyInvestCycle Regime API", version="0.3")


def _calendar_shift(date_text: str, days: int) -> str:
    return (pd.to_datetime(date_text, format="%Y%m%d") + pd.Timedelta(days=days)).strftime("%Y%m%d")


def _today_text() -> str:
    return date.today().strftime("%Y%m%d")


def _load_index_window(start_date: str, end_date: str):
    df = get_index_daily(DEFAULT_INDEX_CODE, start_date, end_date)
    if df.empty:
        raise HTTPException(status_code=503, detail="No index data returned from Tushare.")
    return df


def _load_hsgt_for_index(index_df, as_of: str):
    window = index_df[index_df["trade_date"] <= as_of].tail(30)
    if window.empty:
        return None
    try:
        return get_moneyflow_hsgt(str(window["trade_date"].iloc[0]), as_of)
    except Exception:
        return None


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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
        series.append(
            {
                "as_of": result["as_of"],
                "regime": result["regime"],
                "confidence": result["confidence"],
                "regime_score": result["regime_score"],
                "sub_scores": result["sub_scores"],
            }
        )

    return {"start": start_date, "end": end_date, "items": series}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("web.app:app", host="127.0.0.1", port=WEB_PORT, reload=False)
