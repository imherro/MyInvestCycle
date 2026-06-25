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
- Regime transition matrix builder for predictive-power validation.
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

Build the Task 7.1 transition matrix:

```powershell
python scripts/build_transition_matrix.py --start 20200101 --end 20260624
```

Use local cached market breadth only, skipping dates that have no cached
`market_daily` file:

```powershell
python scripts/build_transition_matrix.py --start 20200101 --end 20260624 --cache-only
```

Default output:

```text
data/transition_matrix.json
```

Run the Task 7.2 forward-outcome validation:

```powershell
python scripts/regime_forward_test.py --start 20200101 --end 20260624
```

Use local cached market breadth only:

```powershell
python scripts/regime_forward_test.py --start 20200101 --end 20260624 --cache-only
```

Default output:

```text
data/regime_forward_test.json
```

Run the Task 8 data coverage audit:

```powershell
python scripts/regime_coverage_audit.py --start 20200101 --end 20260624
```

Preview full-history `market_daily` backfill without fetching:

```powershell
python scripts/full_history_backfill.py --start 20200101 --end 20260624
```

Fetch missing market breadth cache incrementally:

```powershell
python scripts/full_history_backfill.py --start 20200101 --end 20260624 --execute --limit 50 --batch-size 50 --retries 2
```

Default coverage output:

```text
data/regime_coverage_audit.json
```

Default backfill log:

```text
data/backfill_log.json
```

Build the H1.1 regime hazard dataset:

```powershell
python scripts/build_hazard_dataset.py --start 20200101 --end 20260624 --cache-only
```

Default output:

```text
data/hazard_dataset.json
```

Build the H1.2 structural hazard dataset:

```powershell
python scripts/build_structural_hazard_dataset.py --start 20200101 --end 20260624 --cache-only
```

Default output:

```text
data/structural_hazard_dataset.json
```
