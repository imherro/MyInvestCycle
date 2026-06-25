from __future__ import annotations

import argparse
from datetime import date

import numpy as np
import pandas as pd

from config import DEFAULT_INDEX_CODE
from core.breadth import get_market_daily, get_market_history_sample
from core.data_loader import get_index_daily
from core.liquidity import get_moneyflow_hsgt
from engine.market_engine import analyze_index_regime
from engine.regime_hazard_labeler import build_hazard_dataset, hazard_label_distribution, validate_hazard_dataset


def build_sample_index_daily(rows: int = 180) -> pd.DataFrame:
    dates = pd.bdate_range(end="2026-06-24", periods=rows)
    step = np.arange(rows)

    trend = 3000 + step * 2.15
    cycle = np.sin(step / 4.5) * 35
    close = trend + cycle
    open_ = close * (1 + np.sin(step / 7.0) * 0.002)
    high = np.maximum(open_, close) * 1.006
    low = np.minimum(open_, close) * 0.994
    pre_close = np.r_[close[0], close[:-1]]
    change = close - pre_close
    pct_chg = np.divide(change, pre_close, out=np.zeros_like(change), where=pre_close != 0) * 100

    return pd.DataFrame(
        {
            "ts_code": "000001.SH",
            "trade_date": dates.strftime("%Y%m%d"),
            "close": close,
            "open": open_,
            "high": high,
            "low": low,
            "pre_close": pre_close,
            "change": change,
            "pct_chg": pct_chg,
            "vol": 100000 + step * 120,
            "amount": 300000 + step * 180,
        }
    )


def build_sample_market_daily(trade_date: str = "20260624", rows: int = 500) -> pd.DataFrame:
    idx = np.arange(rows)
    pct_chg = np.sin(idx / 8.0) * 1.8 + 0.45
    pct_chg[idx % 37 == 0] = 9.8
    close = 10 + idx * 0.01 + pct_chg * 0.05
    high = close * (1 + np.maximum(pct_chg, 0) / 1000)

    return pd.DataFrame(
        {
            "ts_code": [f"{i:06d}.SZ" for i in range(rows)],
            "trade_date": trade_date,
            "open": close * 0.995,
            "high": high,
            "low": close * 0.990,
            "close": close,
            "pre_close": close / (1 + pct_chg / 100),
            "change": close - close / (1 + pct_chg / 100),
            "pct_chg": pct_chg,
            "vol": 1000 + idx,
            "amount": 10000 + idx * 10,
        }
    )


def build_sample_hsgt(trade_dates: pd.Series) -> pd.DataFrame:
    dates = pd.Series(trade_dates).tail(20).reset_index(drop=True)
    step = np.arange(len(dates))
    return pd.DataFrame(
        {
            "trade_date": dates,
            "ggt_ss": 0.0,
            "ggt_sz": 0.0,
            "hgt": 0.0,
            "sgt": 0.0,
            "north_money": 25 + step * 2.5,
            "south_money": 0.0,
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Task 1 regime engine smoke test.")
    parser.add_argument("--live", action="store_true", help="Fetch live Tushare index data before analysis.")
    parser.add_argument("--ts-code", default=DEFAULT_INDEX_CODE)
    parser.add_argument("--start-date", default="20240101")
    parser.add_argument("--end-date", default=date.today().strftime("%Y%m%d"))
    parser.add_argument("--history-sample-size", type=int, default=0)
    args = parser.parse_args()

    market_history = None
    if args.live:
        df = get_index_daily(args.ts_code, args.start_date, args.end_date)
        if df.empty:
            raise RuntimeError("No live index rows returned from Tushare.")
        market_daily = get_market_daily(str(df["trade_date"].iloc[-1]))
        if args.history_sample_size > 0:
            history_start = (
                pd.to_datetime(str(df["trade_date"].iloc[-1]), format="%Y%m%d") - pd.Timedelta(days=370)
            ).strftime("%Y%m%d")
            market_history = get_market_history_sample(
                market_daily,
                history_start,
                str(df["trade_date"].iloc[-1]),
                sample_size=args.history_sample_size,
            )
        hsgt = get_moneyflow_hsgt(str(df["trade_date"].iloc[-30]), str(df["trade_date"].iloc[-1]))
        source = "tushare"
    else:
        df = build_sample_index_daily()
        market_daily = build_sample_market_daily(str(df["trade_date"].iloc[-1]))
        hsgt = build_sample_hsgt(df["trade_date"])
        source = "sample"

    result = analyze_index_regime(
        df,
        market_daily_df=market_daily,
        market_history_df=market_history,
        hsgt_df=hsgt,
    )
    print(f"source: {source}")
    print(f"as_of: {result['as_of']}")
    print(f"regime: {result['regime']}")
    print(f"confidence: {result['confidence']:.2f}")
    print(f"trend_score: {result['trend_score']:.2f}")
    print(f"breadth_score: {result['breadth_score']:.2f}")
    print(f"liquidity_score: {result['liquidity_score']:.2f}")
    print(f"volatility_score: {result['volatility_score']:.2f}")
    print(f"regime_score: {result['regime_score']:.2f}")

    assert result["regime"] in {"bull", "bear", "range", "transition"}
    assert 0.0 <= result["confidence"] <= 1.0
    assert 0.0 <= result["trend_score"] <= 1.0
    assert 0.0 <= result["breadth_score"] <= 1.0
    assert 0.0 <= result["liquidity_score"] <= 1.0
    assert 0.0 <= result["volatility_score"] <= 1.0
    assert all(not key.endswith("_breadth_score") for key in result)
    assert result["liquidity_score"] > 0.0

    hazard_samples = build_hazard_dataset(
        [
            {
                "trade_date": "20260101",
                "regime": "range",
                "trend_score": 0.45,
                "breadth_score": 0.50,
                "liquidity_score": 0.55,
                "volatility_score": 0.70,
                "regime_score": 0.52,
                "confidence": 0.60,
            },
            {
                "trade_date": "20260102",
                "regime": "range",
                "trend_score": 0.46,
                "breadth_score": 0.49,
                "liquidity_score": 0.54,
                "volatility_score": 0.69,
                "regime_score": 0.51,
                "confidence": 0.61,
            },
            {
                "trade_date": "20260105",
                "regime": "transition",
                "trend_score": 0.62,
                "breadth_score": 0.40,
                "liquidity_score": 0.50,
                "volatility_score": 0.65,
                "regime_score": 0.54,
                "confidence": 0.66,
            },
        ]
    )
    validate_hazard_dataset(hazard_samples)
    assert [sample["label"] for sample in hazard_samples] == [0, 1]
    assert hazard_samples[0]["features"]["pressure"] == 0.05
    assert hazard_samples[1]["features"]["regime_persistence"] == 2
    assert hazard_label_distribution(hazard_samples)["transition_events"] == 1


if __name__ == "__main__":
    main()
