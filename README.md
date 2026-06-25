# MyInvestCycle

A-share market regime analysis prototype. Task 1 implements the data and feature
engine foundation requested by the design review.

## Current Scope

- Tushare index daily loader with local CSV cache.
- Reusable feature functions for moving averages, slope, volatility, drawdown,
  and score normalization.
- Real market breadth scoring from all-stock daily distribution.
- Liquidity scoring from index turnover expansion and optional northbound flow.
- Market regime engine returning `regime`, `confidence`, and four sub-scores.
- Reserved Web port: `8021`.

Current tasks intentionally do not include a Web UI or charts.

## Run

Smoke test with deterministic sample data:

```powershell
python engine_test.py
```

Live Tushare test, using `TUSHARE_TOKEN` from `.env`:

```powershell
python engine_test.py --live --ts-code 000001.SH --start-date 20240101
```

Expected output fields:

```text
regime
confidence
trend_score
breadth_score
liquidity_score
volatility_score
regime_score
```

Update local cache only:

```powershell
python scripts/update_daily.py --ts-code 000001.SH --start-date 20150101
```
