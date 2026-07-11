# V15.3 Macro Drawdown Regime Baseline Backtest

## Purpose

V15.3 runs the first research-only backtest after the V15 strategy rebase.

It tests one core hypothesis: in early or middle bull regimes, broad-index drawdowns may be add-position opportunities; in late-cycle or contraction regimes, drawdowns should be treated more defensively.

This phase is not a production strategy release. It does not create orders, connect to a broker, produce intraday signals or tell the user to trade.

## Strategy Rule

Carrier index:

- `000300.SH` CSI 300 close series

Timing rule:

- Market phase and drawdown are observed after close on day `t`.
- The target exposure is applied to day `t+1` return.

Exposure rule:

- `EARLY_CYCLE` / `EXPANSION`: 85% base, 100% when CSI 300 drawdown is at least 8%.
- `ROTATION`: 65% base, 75% when drawdown is at least 10%.
- `LATE_CYCLE`: 55% base, 30% when drawdown is at least 5%.
- `CONTRACTION`: 25% base, 15% when drawdown is at least 5%.
- `UNKNOWN`: 50%.

Cash return assumption:

- 2.0% annualized cash baseline, converted to daily return with 252 trading days.

## Output

Generated artifact:

- `data/v15_macro_drawdown_backtest_result.json`

Primary API:

- `GET /api/strategy-rebase/v15-macro-drawdown-backtest`

Summary page:

- `/validation`, card title `V15.3 宏观回撤基准回测`

## Current Result

Backtest window:

- `20150105` to `20260708`
- 2,796 sessions

Macro drawdown strategy:

- Total return: 50.38%
- CAGR / annual return: 3.75%
- Annual alpha vs CSI 300: 1.31%
- Max drawdown: -35.92%
- Calmar: 0.104
- Sharpe: 0.186
- Longest drawdown recovery days: 1,264

Benchmarks over the same full window:

- Cash baseline CAGR: 2.02%
- CSI 300 buy hold CAGR: 2.44%, max drawdown -46.70%
- Shanghai Composite buy hold CAGR: 1.54%, max drawdown -52.30%

Old strategy baseline is only available from `20200103` to `20260626`, so it is compared separately in `common_period_comparison`.

## Interpretation

The V15.3 rule beats cash, CSI 300 and Shanghai Composite on the full 2015-2026 window and improves max drawdown versus CSI 300.

However, the absolute CAGR is only about 3.75%, Calmar is low, and drawdown recovery remains long. This is not strong enough to package as a finished investment strategy. It is a baseline proving that macro + drawdown context may be directionally useful, but still needs better alpha generation and structural bull handling.

## Boundary

Required flags:

- `research_backtest_only = true`
- `not_production_signal = true`
- `no_real_trade_order = true`
- `constraints.no_broker_connection = true`
- `constraints.no_order_generation = true`
- `constraints.not_intraday_signal = true`
- `constraints.not_production_trade_signal = true`

If future variants underperform cash or broad-index benchmarks, that failure is acceptable evidence and must not be marketed as a success.
