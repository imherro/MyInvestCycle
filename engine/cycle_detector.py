from __future__ import annotations

import pandas as pd


def _state_from_close(close: float, ma250: float | None) -> str | None:
    if ma250 is None or pd.isna(ma250):
        return None
    return "bull" if close >= ma250 else "bear"


def _prepare_cycle_frame(index_df: pd.DataFrame, confirm_days: int) -> tuple[pd.DataFrame, list[dict], int, str]:
    if index_df.empty:
        raise ValueError("index_df is empty")

    df = index_df.copy().sort_values("trade_date").reset_index(drop=True)
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df["ma60"] = df["close"].rolling(60, min_periods=60).mean()
    df["ma120"] = df["close"].rolling(120, min_periods=120).mean()
    df["ma250"] = df["close"].rolling(250, min_periods=250).mean()
    returns = df["close"].pct_change()
    df["return_20"] = df["close"].pct_change(20)
    df["return_60"] = df["close"].pct_change(60)
    df["volatility_20"] = returns.rolling(20, min_periods=10).std() * (252 ** 0.5)
    df["ma120_slope_20"] = df["ma120"].pct_change(20)
    df["ma250_distance"] = df["close"] / df["ma250"] - 1.0
    df["drawdown_60"] = df["close"] / df["close"].rolling(60, min_periods=20).max() - 1.0
    df = df.dropna(subset=["close"]).reset_index(drop=True)

    current_state: str | None = None
    current_start_index: int | None = None
    pending_state: str | None = None
    pending_start_index: int | None = None
    states: list[str | None] = []
    cycles: list[dict] = []

    for index, row in df.iterrows():
        raw_state = _state_from_close(float(row["close"]), row["ma250"])
        if raw_state is None:
            states.append(None)
            continue

        if current_state is None:
            current_state = raw_state
            current_start_index = index
            pending_state = None
            pending_start_index = None
            states.append(current_state)
            continue

        if raw_state == current_state:
            pending_state = None
            pending_start_index = None
            states.append(current_state)
            continue

        if pending_state != raw_state:
            pending_state = raw_state
            pending_start_index = index

        if pending_start_index is not None and index - pending_start_index + 1 >= confirm_days:
            if current_start_index is not None:
                end_index = max(pending_start_index - 1, current_start_index)
                start_row = df.iloc[current_start_index]
                end_row = df.iloc[end_index]
                cycles.append(_cycle_summary(df, current_start_index, end_index, current_state, start_row, end_row))
            current_state = raw_state
            current_start_index = pending_start_index
            pending_state = None
            pending_start_index = None

        states.append(current_state)

    df["cycle_state"] = states
    if current_state is None or current_start_index is None:
        raise ValueError("Not enough index history for major-cycle detection.")
    df["cycle_group"] = df["cycle_state"].ne(df["cycle_state"].shift()).cumsum()
    df.loc[df["cycle_state"].isna(), "cycle_group"] = pd.NA
    df["cycle_elapsed_sessions"] = df.groupby("cycle_group").cumcount() + 1

    return df, cycles, current_start_index, current_state


def detect_major_cycles(index_df: pd.DataFrame, *, confirm_days: int = 20) -> dict:
    df, cycles, current_start_index, current_state = _prepare_cycle_frame(index_df, confirm_days)

    latest_index = len(df) - 1
    latest_row = df.iloc[latest_index]
    current_cycle = _cycle_summary(
        df,
        current_start_index,
        latest_index,
        current_state,
        df.iloc[current_start_index],
        latest_row,
        ongoing=True,
    )

    return {
        "as_of": str(latest_row["trade_date"]),
        "method": f"close_vs_ma250_confirm_{confirm_days}d",
        "current_cycle": current_cycle,
        "recent_cycles": cycles[-8:],
        "series": [
            {
                "as_of": str(row["trade_date"]),
                "regime": row["cycle_state"],
                "index": {
                    "close": round(float(row["close"]), 4),
                    "ma120": None if pd.isna(row["ma120"]) else round(float(row["ma120"]), 4),
                    "ma250": None if pd.isna(row["ma250"]) else round(float(row["ma250"]), 4),
                },
            }
            for _, row in df.dropna(subset=["cycle_state"]).iterrows()
        ],
    }


def detect_current_cycle_track(
    index_df: pd.DataFrame,
    *,
    confirm_days: int = 20,
    horizons: tuple[int, ...] = (20, 60, 120),
) -> dict:
    df, _, current_start_index, current_state = _prepare_cycle_frame(index_df, confirm_days)
    latest_index = len(df) - 1
    latest_row = df.iloc[latest_index]
    current_cycle = _cycle_summary(
        df,
        current_start_index,
        latest_index,
        current_state,
        df.iloc[current_start_index],
        latest_row,
        ongoing=True,
    )
    track_df = df.iloc[current_start_index : latest_index + 1].copy()
    track_df["regime"] = track_df.apply(_index_regime_state, axis=1)

    return {
        "as_of": str(latest_row["trade_date"]),
        "method": f"current_cycle_track_close_vs_ma250_confirm_{confirm_days}d",
        "cycle": current_cycle,
        "items": [_track_item(row) for _, row in track_df.iterrows()],
        "forecast": _similar_forecast(df, latest_index, current_state, horizons),
    }


def _index_regime_state(row: pd.Series) -> str:
    close = float(row["close"])
    ma120 = row["ma120"]
    ma250 = row["ma250"]
    if pd.isna(ma120) or pd.isna(ma250):
        return row["cycle_state"] if isinstance(row["cycle_state"], str) else "range"

    ma120_distance = close / float(ma120) - 1.0
    ma250_distance = close / float(ma250) - 1.0
    slope = row["ma120_slope_20"]
    drawdown = row["drawdown_60"]

    if ma250_distance < -0.02:
        return "bear"
    if drawdown <= -0.10 or (ma120_distance < -0.02 and slope < 0):
        return "transition"
    if abs(ma250_distance) <= 0.04 or abs(ma120_distance) <= 0.025:
        return "range"
    if ma120_distance > 0 and (pd.isna(slope) or slope >= 0) and (pd.isna(drawdown) or drawdown > -0.08):
        return "bull"
    return "range"


def _track_item(row: pd.Series) -> dict:
    return {
        "as_of": str(row["trade_date"]),
        "regime": row["regime"],
        "index": {
            "close": round(float(row["close"]), 4),
            "ma60": None if pd.isna(row["ma60"]) else round(float(row["ma60"]), 4),
            "ma120": None if pd.isna(row["ma120"]) else round(float(row["ma120"]), 4),
            "ma250": None if pd.isna(row["ma250"]) else round(float(row["ma250"]), 4),
        },
    }


def _similar_forecast(df: pd.DataFrame, latest_index: int, current_state: str, horizons: tuple[int, ...]) -> dict:
    max_horizon = max(horizons)
    latest = df.iloc[latest_index]
    feature_columns = [
        "ma250_distance",
        "return_60",
        "volatility_20",
        "drawdown_60",
        "cycle_elapsed_sessions",
    ]
    current_features = latest[feature_columns]
    candidate_limit = latest_index - max_horizon
    candidates = df.iloc[:candidate_limit].copy()
    candidates = candidates[candidates["cycle_state"] == current_state]
    candidates = candidates.dropna(subset=feature_columns + ["ma250"])
    candidates = candidates[candidates["cycle_elapsed_sessions"] >= 40]

    if candidates.empty or current_features.isna().any():
        return _empty_forecast(latest, horizons)

    scales = {
        "ma250_distance": 0.10,
        "return_60": 0.18,
        "volatility_20": 0.18,
        "drawdown_60": 0.12,
        "cycle_elapsed_sessions": 252.0,
    }
    distance = 0
    for column in feature_columns:
        distance += ((candidates[column] - float(current_features[column])) / scales[column]).abs()
    candidates = candidates.assign(similarity_distance=distance).sort_values("similarity_distance").head(160)

    paths = []
    returns_by_horizon = {}
    for horizon in horizons:
        horizon_returns = []
        horizon_above_ma250 = []
        for idx in candidates.index:
            future_index = idx + horizon
            if future_index >= len(df):
                continue
            future_row = df.iloc[future_index]
            if pd.isna(future_row["close"]) or pd.isna(future_row["ma250"]):
                continue
            horizon_returns.append(float(future_row["close"]) / float(df.iloc[idx]["close"]) - 1.0)
            horizon_above_ma250.append(float(future_row["close"]) >= float(future_row["ma250"]))

        if not horizon_returns:
            continue

        series = pd.Series(horizon_returns)
        returns_by_horizon[horizon] = {
            "returns": horizon_returns,
            "above_ma250": horizon_above_ma250,
        }
        paths.append(
            {
                "horizon_sessions": horizon,
                "as_of": _future_business_date(str(latest["trade_date"]), horizon),
                "cautious": _project_price(latest["close"], series.quantile(0.25)),
                "neutral": _project_price(latest["close"], series.quantile(0.50)),
                "optimistic": _project_price(latest["close"], series.quantile(0.75)),
                "median_return_pct": round(float(series.quantile(0.50)) * 100, 2),
            }
        )

    basis_horizon = 60 if 60 in returns_by_horizon else next(iter(returns_by_horizon), None)
    if basis_horizon is None:
        return _empty_forecast(latest, horizons)

    basis = returns_by_horizon[basis_horizon]
    returns = basis["returns"]
    above_ma250 = basis["above_ma250"]
    weaken = sum(1 for value, above in zip(returns, above_ma250) if value <= -0.08 or not above)
    continuation = sum(1 for value, above in zip(returns, above_ma250) if value >= 0.03 and above)
    total = len(returns)
    range_count = max(total - continuation - weaken, 0)

    return {
        "basis": "historical_similar_samples",
        "basis_horizon_sessions": basis_horizon,
        "sample_size": int(total),
        "probabilities": {
            "continue": round(continuation / total, 2),
            "range": round(range_count / total, 2),
            "weaken": round(weaken / total, 2),
        },
        "paths": paths,
        "key_levels": {
            "current_close": round(float(latest["close"]), 4),
            "ma120": None if pd.isna(latest["ma120"]) else round(float(latest["ma120"]), 4),
            "ma250": None if pd.isna(latest["ma250"]) else round(float(latest["ma250"]), 4),
            "drawdown_60_pct": None if pd.isna(latest["drawdown_60"]) else round(float(latest["drawdown_60"]) * 100, 2),
        },
    }


def _empty_forecast(latest: pd.Series, horizons: tuple[int, ...]) -> dict:
    return {
        "basis": "insufficient_similar_samples",
        "basis_horizon_sessions": 60 if 60 in horizons else max(horizons),
        "sample_size": 0,
        "probabilities": {"continue": None, "range": None, "weaken": None},
        "paths": [],
        "key_levels": {
            "current_close": round(float(latest["close"]), 4),
            "ma120": None if pd.isna(latest["ma120"]) else round(float(latest["ma120"]), 4),
            "ma250": None if pd.isna(latest["ma250"]) else round(float(latest["ma250"]), 4),
            "drawdown_60_pct": None if pd.isna(latest["drawdown_60"]) else round(float(latest["drawdown_60"]) * 100, 2),
        },
    }


def _future_business_date(trade_date: str, sessions: int) -> str:
    start = pd.to_datetime(trade_date, format="%Y%m%d")
    return pd.bdate_range(start=start, periods=sessions + 1)[-1].strftime("%Y%m%d")


def _project_price(current_close: float, return_value: float) -> float:
    return round(float(current_close) * (1.0 + float(return_value)), 4)


def _cycle_summary(
    df: pd.DataFrame,
    start_index: int,
    end_index: int,
    state: str,
    start_row: pd.Series,
    end_row: pd.Series,
    *,
    ongoing: bool = False,
) -> dict:
    start_close = float(start_row["close"])
    end_close = float(end_row["close"])
    elapsed_sessions = end_index - start_index + 1
    return {
        "state": state,
        "start_date": str(start_row["trade_date"]),
        "end_date": None if ongoing else str(end_row["trade_date"]),
        "ongoing": ongoing,
        "elapsed_sessions": int(elapsed_sessions),
        "elapsed_years": round(elapsed_sessions / 252, 2),
        "start_close": round(start_close, 4),
        "current_close": round(end_close, 4),
        "return_pct": round((end_close / start_close - 1.0) * 100, 2) if start_close else 0.0,
    }
