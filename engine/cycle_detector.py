from __future__ import annotations

import pandas as pd


def _state_from_close(close: float, ma250: float | None) -> str | None:
    if ma250 is None or pd.isna(ma250):
        return None
    return "bull" if close >= ma250 else "bear"


def detect_major_cycles(index_df: pd.DataFrame, *, confirm_days: int = 20) -> dict:
    if index_df.empty:
        raise ValueError("index_df is empty")

    df = index_df.copy().sort_values("trade_date").reset_index(drop=True)
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df["ma120"] = df["close"].rolling(120, min_periods=120).mean()
    df["ma250"] = df["close"].rolling(250, min_periods=250).mean()
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
