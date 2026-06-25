# MyInvestCycle

A-share market regime analysis prototype. Task 1 implements the data and feature
engine foundation requested by the design review.

## Current Scope

- Tushare index daily loader with local CSV cache.
- Reusable feature functions for moving averages, slope, volatility, drawdown,
  and score normalization.
- Real market breadth scoring from all-stock daily distribution.
- Lightweight 52-week high approximation from cached high-turnover stock history.
- Liquidity scoring from index turnover expansion and optional northbound flow.
- Market regime engine returning `regime`, `confidence`, and four sub-scores.
- Web dashboard on port `8021` with current-cycle tracking, probability outlook,
  long-term cycle view, and historical cycle theme blocks.
- Long-term bull/bear blocks use market-consensus major turning points and
  narrative themes; MA120/MA250 are retained as observation overlays rather than
  the segmentation trigger.

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

Run the JSON API:

```powershell
python web/app.py
```

Endpoints:

- `GET http://127.0.0.1:8021/api/health`
- `GET http://127.0.0.1:8021/api/regime/current`
- `GET http://127.0.0.1:8021/api/regime/history?start=20260601&end=20260624`
- `GET http://127.0.0.1:8021/api/features/latest`
- `GET http://127.0.0.1:8021/api/regime/explain`
- `GET http://127.0.0.1:8021/api/regime/cycle`
- `GET http://127.0.0.1:8021/api/regime/cycle/track`

Validation scripts:

```powershell
python scripts/regime_stability_test.py --runs 20
python scripts/regime_drift_detector.py --window 30
python scripts/regime_explainer_test.py
```
