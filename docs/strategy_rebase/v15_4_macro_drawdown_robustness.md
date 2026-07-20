# V15.4 Macro + Drawdown Robustness And Walk-Forward Validation

## Purpose

V15.4 tests whether the V15.3 macro-cycle plus drawdown baseline is a stable research result or a narrow parameter accident. It does not add valuation, crowding, sector rotation, ETF selection, current positions, or trading instructions.

## Validation Design

- Carrier and phase inputs remain identical to V15.3.
- Every variant observes phase and CSI300 drawdown after close on day `t` and applies exposure to day `t+1` return.
- Drawdown trigger thresholds are scaled by `0.75`, `1.00`, and `1.25`.
- Exposure strength is scaled around neutral exposure `0.50` by `0.75`, `1.00`, and `1.25`, clipped to `[0, 1]`.
- The resulting neighborhood contains nine variants.
- Cost sensitivity is measured at `0`, `5`, and `10` basis points per one-way exposure change.
- Annual walk-forward validation starts after five training years. For each test year, only earlier dates are used to select the highest training Calmar variant, with CAGR and shallower drawdown as tie breakers. A training maximum drawdown below `-45%` is rejected.

## Result

The nine variants are close to one another, so the baseline is not extremely parameter-sensitive:

- Default V15.3 CAGR: `3.7469%`
- Best neighborhood CAGR: `3.8742%`
- Worst neighborhood CAGR: `3.5788%`
- CAGR range: `0.2954 percentage points`
- Calmar range: `0.008011`

However, the default V15.3 parameter set ranks `9 / 9`. Nearby rules do not rescue the low absolute return; they only produce similarly weak outcomes.

At `5bp` one-way cost, the prior-data-only annual walk-forward result is:

- CAGR: `3.3127%`
- Annual alpha versus the aligned CSI300 window: `0.9006%`
- Maximum drawdown: `-25.2230%`
- Calmar: `0.131338`
- Sharpe: `0.178318`
- Test years: `2020` through `2026`

The walk-forward series includes each test year's first trading-day return by carrying the prior trading day as the normalization point. It beats the aligned CSI300 CAGR, but the absolute return remains modest and does not overturn the V15.3 finding that the old strategy baseline was stronger on its common period.

## Point-In-Time Caveat

V15.4 re-applies `t+1` execution for every parameter variant and uses only pre-test-year rows for walk-forward selection. That timing boundary is verified in code and tests.

The historical phase series itself is not independently proven to be a strict publication-time dataset. `market_phase_snapshot.json` may contain reconstructed historical replay. V15.4 therefore records:

```text
strict_point_in_time_status = unverified
phase_history_strict_point_in_time_not_independently_verified = true
```

This caveat blocks strategy promotion even if headline metrics improve.

## Decision

V15.4 does not promote V15.3. The next research task should first establish publication-time lineage for historical macro phases, then test an independently defined valuation/crowding late-cycle overlay. Adding sector or ETF complexity before those checks would make attribution harder.

## Boundary

- Research backtest only.
- No production signal.
- No current position recommendation.
- No broker connection.
- No order generation.
- No intraday signal.
