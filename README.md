# MyInvestCycle

A-share market regime analysis prototype. Task 1 implements the data and feature
engine foundation requested by the design review.

## Current Scope

- Tushare index daily loader with local CSV cache.
- Reusable feature functions for moving averages, slope, volatility, drawdown,
  and placeholder breadth.
- Basic market regime engine returning `bull`, `bear`, `range`, or
  `transition`.
- Reserved Web port: `8021`.

Task 1 intentionally does not include a Web UI or charts.

## Run

Smoke test with deterministic sample data:

```powershell
python engine_test.py
```

Live Tushare test, using `TUSHARE_TOKEN` from `.env`:

```powershell
python engine_test.py --live --ts-code 000001.SH --start-date 20240101
```

Update local cache only:

```powershell
python scripts/update_daily.py --ts-code 000001.SH --start-date 20150101
```
