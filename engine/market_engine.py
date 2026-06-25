from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from core.features import build_feature_frame


def _clip(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _scale(value: float, low: float, high: float) -> float:
    if high <= low:
        raise ValueError("high must be greater than low")
    return _clip((value - low) / (high - low))


@dataclass(frozen=True)
class MarketRegimeResult:
    regime: str
    trend_score: float
    volatility_score: float
    mock_breadth_score: float
    as_of: str | None

    def to_dict(self) -> dict[str, float | str | None]:
        return {
            "regime": self.regime,
            "trend_score": self.trend_score,
            "volatility_score": self.volatility_score,
            "mock_breadth_score": self.mock_breadth_score,
            "as_of": self.as_of,
        }


class MarketEngine:
    """Basic rule engine for Task 1."""

    def analyze(self, index_df: pd.DataFrame) -> MarketRegimeResult:
        if index_df.empty:
            raise ValueError("index_df is empty")

        features = build_feature_frame(index_df)
        required = ["close", "ma20", "ma60", "ma120", "ma20_slope", "return_60", "volatility_20"]
        valid = features.dropna(subset=required)
        if valid.empty:
            raise ValueError("Not enough index history. At least 120 trading rows are required.")

        latest = valid.iloc[-1]

        above_ma120 = 1.0 if latest["close"] > latest["ma120"] else 0.0
        ma_stack = 1.0 if latest["ma20"] > latest["ma60"] else 0.0
        slope_score = _scale(float(latest["ma20_slope"]), -0.02, 0.03)
        momentum_score = _scale(float(latest["return_60"]), -0.10, 0.25)

        trend_score = _clip(
            0.30 * above_ma120
            + 0.25 * ma_stack
            + 0.20 * slope_score
            + 0.25 * momentum_score
        )
        volatility_score = _clip(float(latest["volatility_20"]) / 0.45)
        breadth_score = _clip(float(latest["breadth_proxy"]))

        regime = classify_regime(trend_score, volatility_score, breadth_score)
        as_of = str(latest["trade_date"]) if "trade_date" in latest else None

        return MarketRegimeResult(
            regime=regime,
            trend_score=round(trend_score, 2),
            volatility_score=round(volatility_score, 2),
            mock_breadth_score=round(breadth_score, 2),
            as_of=as_of,
        )


def classify_regime(trend_score: float, volatility_score: float, breadth_score: float) -> str:
    if trend_score >= 0.65 and breadth_score >= 0.50 and volatility_score <= 0.65:
        return "bull"
    if trend_score <= 0.35 and volatility_score >= 0.35:
        return "bear"
    if 0.45 <= trend_score < 0.65 and breadth_score >= 0.45:
        return "transition"
    return "range"


def analyze_index_regime(index_df: pd.DataFrame) -> dict[str, float | str | None]:
    return MarketEngine().analyze(index_df).to_dict()
