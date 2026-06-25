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
- The probability outlook includes a forecast confidence score based on sample
  support and probability concentration.
- `GET /api` exposes the full interface catalog, documentation links,
  recommended entrypoints, and read-only simulation boundary.
- Completed research and risk-control outputs are surfaced on the Web dashboard
  through the full-results overview section.
- R2.1 portfolio allocation engine maps risk-engine output into total exposure,
  cash ratio, and policy-driven strategy allocation; no stock selection is done.
- R2.2 strategy routing layer converts portfolio allocation into enabled
  strategies, disabled reasons, and strategy budgets; no trade execution is done.
- R3.1 execution simulation layer converts strategy routing into execution
  intent and simulated orders; no broker connection or real order is created.
- M1.1 Meta Signal Engine detects internal contradictions between regime, risk,
  hazard, portfolio, and strategy layers; it does not predict returns, select
  stocks, or execute trades.
- FINAL system boundary freeze locks the five-layer decision simulation pipeline
  with architecture documentation, policy lock, decision trace, integrity check,
  and a final system snapshot API.
- Long-term bull/bear blocks use market-consensus major turning points and
  narrative themes; MA120/MA250 are retained as observation overlays rather than
  the segmentation trigger.

## Development Rule

Every new feature, research output, validation result, or risk-control capability
must have a visible Web dashboard entry before the work is considered complete.
If a feature produces data or a decision, the page should show the current value,
the supporting evidence, and the practical interpretation for users.

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

- `GET http://127.0.0.1:8021/api`
- `GET http://127.0.0.1:8021/docs`
- `GET http://127.0.0.1:8021/redoc`
- `GET http://127.0.0.1:8021/openapi.json`
- `GET http://127.0.0.1:8021/api/health`
- `GET http://127.0.0.1:8021/api/regime/current`
- `GET http://127.0.0.1:8021/api/regime/history?start=20260601&end=20260624`
- `GET http://127.0.0.1:8021/api/features/latest`
- `GET http://127.0.0.1:8021/api/regime/explain`
- `GET http://127.0.0.1:8021/api/regime/cycle`
- `GET http://127.0.0.1:8021/api/regime/cycle/track`
- `GET http://127.0.0.1:8021/api/portfolio/current`
- `GET http://127.0.0.1:8021/api/strategy/current`
- `GET http://127.0.0.1:8021/api/execution/current`
- `GET http://127.0.0.1:8021/api/meta-edge/current`
- `GET http://127.0.0.1:8021/api/system/snapshot`
- `GET http://127.0.0.1:8021/api/results/summary`

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

Train and evaluate the H1.3 structural hazard model:

```powershell
python scripts/train_hazard_model.py --start 20200101 --end 20260624 --model logistic
python scripts/evaluate_hazard_model.py --start 20200101 --end 20260624
python scripts/evaluate_hazard_sensitivity.py
```

Default outputs:

```text
data/hazard_model_logistic.json
data/hazard_model_evaluation.json
data/hazard_model_sensitivity.json
```

Build the H2.1 regime survival dataset:

```powershell
python scripts/build_survival_dataset.py --start 20200101 --end 20260624 --cache-only
```

Default output:

```text
data/survival_dataset.json
```

Build the H2.1.1 structural regime survival dataset:

```powershell
python scripts/build_structural_survival_dataset.py --start 20200101 --end 20260624 --cache-only
```

Default output:

```text
data/structural_survival_dataset.json
```

Run the R1.1 Regime Risk Adapter bridge:

```powershell
python scripts/test_risk_adapter.py --date 20260624 --cache-only
```

Adapter output is a normalized risk input signal only; it does not score risk,
choose a strategy, or recommend exposure.

Run the R1.2 risk scoring and exposure engine:

```powershell
python scripts/test_risk_engine.py --date 20260624 --cache-only
```

Policy is stored in:

```text
rules/risk_policy.yaml
```

Run the R2.1 portfolio allocation engine:

```powershell
python scripts/test_portfolio_allocator.py --date 20260624 --cache-only
```

Portfolio policy is stored in:

```text
rules/portfolio_policy.yaml
```

The portfolio allocator consumes the R1 risk decision and returns:

```text
total_exposure
cash_ratio
strategy_allocation
strategy_capital_allocation
```

Run the R2.2 strategy routing layer:

```powershell
python scripts/test_strategy_router.py --date 20260624 --cache-only
```

Strategy policy is stored in:

```text
rules/strategy_policy.yaml
```

The strategy router consumes the R2.1 portfolio allocation and returns:

```text
enabled_strategies
disabled_strategies
strategy_budget
strategy_capital_budget
disabled_reason
```

Run the R3.1 execution simulation layer:

```powershell
python scripts/test_execution_layer.py --date 20260624 --cache-only
```

Execution policy is stored in:

```text
rules/execution_policy.yaml
```

The execution simulator consumes the R2.2 strategy route and returns:

```text
execution_intent
simulated_orders
constraints
```

Run the M1.1 Meta Signal Engine:

```powershell
python scripts/run_meta_edge_snapshot.py --date 20260624 --cache-only
```

Rules are stored in:

```text
rules/meta_edge_rules.yaml
```

The meta engine consumes existing regime, risk, portfolio, strategy, and hazard
outputs and returns:

```text
meta_edge_score
signals
signal_strengths
signal_details
interpretation
```

Run the FINAL system integrity check:

```powershell
python scripts/system_integrity_check.py --date 20260624 --cache-only
```

Frozen audit artifacts:

```text
docs/system_architecture_freeze.md
logs/decision_trace.json
rules/LOCKED_POLICY.md
```
