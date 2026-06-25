from __future__ import annotations

import argparse
from datetime import date

import numpy as np
import pandas as pd

from config import DEFAULT_INDEX_CODE
from core.data_loader import get_index_daily
from engine.market_engine import analyze_index_regime


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Task 1 regime engine smoke test.")
    parser.add_argument("--live", action="store_true", help="Fetch live Tushare index data before analysis.")
    parser.add_argument("--ts-code", default=DEFAULT_INDEX_CODE)
    parser.add_argument("--start-date", default="20240101")
    parser.add_argument("--end-date", default=date.today().strftime("%Y%m%d"))
    args = parser.parse_args()

    if args.live:
        df = get_index_daily(args.ts_code, args.start_date, args.end_date)
        source = "tushare"
    else:
        df = build_sample_index_daily()
        source = "sample"

    result = analyze_index_regime(df)
    print(f"source: {source}")
    print(f"as_of: {result['as_of']}")
    print(f"regime: {result['regime']}")
    print(f"trend_score: {result['trend_score']:.2f}")
    print(f"volatility_score: {result['volatility_score']:.2f}")
    print(f"mock_breadth_score: {result['mock_breadth_score']:.2f}")

    assert result["regime"] in {"bull", "bear", "range", "transition"}
    assert 0.0 <= result["trend_score"] <= 1.0
    assert 0.0 <= result["volatility_score"] <= 1.0
    assert 0.0 <= result["mock_breadth_score"] <= 1.0


if __name__ == "__main__":
    main()
