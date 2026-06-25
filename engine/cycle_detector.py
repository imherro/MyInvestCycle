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

    if current_state is None or current_start_index is None:
        raise ValueError("Not enough index history for major-cycle detection.")
    df["cycle_state"] = pd.NA
    df["cycle_elapsed_sessions"] = pd.NA
    for cycle in cycles:
        mask = (df["trade_date"].astype(str) >= cycle["start_date"]) & (
            df["trade_date"].astype(str) <= cycle["end_date"]
        )
        df.loc[mask, "cycle_state"] = cycle["state"]
        df.loc[mask, "cycle_elapsed_sessions"] = range(1, int(mask.sum()) + 1)
    current_mask = df.index >= current_start_index
    df.loc[current_mask, "cycle_state"] = current_state
    df.loc[current_mask, "cycle_elapsed_sessions"] = range(1, int(current_mask.sum()) + 1)
    state_for_group = df["cycle_state"].fillna("__none__")
    df["cycle_group"] = state_for_group.ne(state_for_group.shift()).cumsum()
    df.loc[df["cycle_state"].isna(), "cycle_group"] = pd.NA

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
    cycle_blocks = [_cycle_block(cycle) for cycle in [*cycles, current_cycle]]

    return {
        "as_of": str(latest_row["trade_date"]),
        "method": f"close_vs_ma250_confirm_{confirm_days}d",
        "current_cycle": current_cycle,
        "recent_cycles": cycles[-8:],
        "cycle_blocks": cycle_blocks,
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


def _cycle_block(cycle: dict) -> dict:
    theme = _cycle_theme(cycle)
    return {
        **cycle,
        "label": _cycle_label(cycle),
        "short_label": _cycle_short_label(cycle),
        "major": _is_major_cycle(cycle),
        "theme_title": theme["title"],
        "themes": theme["themes"],
        "features": theme["features"],
        "theme_basis": theme["basis"],
    }


def _is_major_cycle(cycle: dict) -> bool:
    return bool(cycle.get("ongoing")) or int(cycle["elapsed_sessions"]) >= 120 or abs(float(cycle["return_pct"])) >= 8


def _cycle_label(cycle: dict) -> str:
    start_year = str(cycle["start_date"])[:4]
    end = cycle.get("end_date")
    end_year = "至今" if end is None else str(end)[:4]
    state = _cycle_state_label(cycle["state"])
    if start_year == end_year:
        return f"{start_year} {state}"
    return f"{start_year}-{end_year} {state}"


def _cycle_short_label(cycle: dict) -> str:
    return f"{str(cycle['start_date'])[:4]} {_cycle_state_label(cycle['state'])}"


def _cycle_theme(cycle: dict) -> dict:
    start = str(cycle["start_date"])
    state = cycle["state"]
    basis = "主题为内置历史行情标签，价格和持续时间来自上证指数数据；后续可接行业/主题指数做量化验证。"

    if state == "bull":
        if "20140724" <= start <= "20150831":
            return {
                "title": "杠杆资金与改革预期牛市",
                "themes": ["券商", "互联网金融", "国企改革", "一带一路", "创业板成长"],
                "features": [
                    "融资融券扩张推动风险偏好快速抬升。",
                    "金融股先启动，随后扩散到成长股和主题投资。",
                    "指数涨幅大、斜率陡，后段波动明显放大。",
                ],
                "basis": basis,
            }
        if "20161001" <= start <= "20180331":
            return {
                "title": "供给侧改革与蓝筹白马行情",
                "themes": ["核心消费", "金融地产", "周期资源", "外资定价"],
                "features": [
                    "盈利改善和供给侧改革支撑周期与龙头公司重估。",
                    "市场更偏向低估值蓝筹、白马和稳定现金流资产。",
                    "指数上行较温和，结构性行情特征强。",
                ],
                "basis": basis,
            }
        if "20190201" <= start <= "20200331":
            return {
                "title": "估值修复与科技成长反弹",
                "themes": ["券商", "5G", "半导体", "科创板预期", "消费电子"],
                "features": [
                    "经历 2018 年下跌后估值修复，券商和科技成长先行。",
                    "科创板、5G 和半导体提升成长风格关注度。",
                    "上证整体涨幅有限，但主题活跃度明显提升。",
                ],
                "basis": basis,
            }
        if "20200601" <= start <= "20220131":
            return {
                "title": "流动性宽松与赛道股牛市",
                "themes": ["新能源车", "锂电", "光伏", "半导体", "核心资产"],
                "features": [
                    "流动性宽松和产业景气推动高景气赛道持续重估。",
                    "新能源、光伏、半导体等成长板块成为主要弹性来源。",
                    "核心资产与赛道股轮动，上证表现弱于部分成长指数。",
                ],
                "basis": basis,
            }
        if "20230101" <= start <= "20230831":
            return {
                "title": "疫后修复与主题轮动行情",
                "themes": ["AI", "数字经济", "中特估", "消费修复"],
                "features": [
                    "经济修复预期与主题催化并存，指数涨幅有限。",
                    "AI、数字经济和中特估成为阶段性主线。",
                    "主线轮动快，持续性弱于典型主升牛市。",
                ],
                "basis": basis,
            }
        if start >= "20240901":
            return {
                "title": "政策转向后的估值修复行情",
                "themes": ["政策预期", "券商金融", "科技成长", "高股息", "央国企重估"],
                "features": [
                    "政策转向和流动性预期改善推动低位估值修复。",
                    "金融与科技成长共同抬升风险偏好。",
                    "当前仍需观察成交、盈利和主线扩散能否继续确认。",
                ],
                "basis": basis,
            }
        return {
            "title": "阶段性估值修复行情",
            "themes": ["估值修复", "风险偏好回升"],
            "features": ["价格重新站上长期均线，但缺少明确可验证的主线标签。"],
            "basis": basis,
        }

    if "20110501" <= start <= "20121231":
        title = "经济下行与估值压缩"
        features = ["盈利和经济预期走弱，指数持续低于长期均线。"]
    elif "20150801" <= start <= "20161031":
        title = "杠杆出清与股灾后修复"
        features = ["前期杠杆牛市结束后，市场进入去杠杆和信心修复阶段。"]
    elif "20180301" <= start <= "20190228":
        title = "去杠杆与外部冲击调整"
        features = ["去杠杆、盈利预期下修和外部不确定性压制风险偏好。"]
    elif "20220101" <= start <= "20230131":
        title = "疫情扰动与地产压力调整"
        features = ["疫情扰动、地产链压力和成长估值回落共同拖累指数。"]
    elif "20230801" <= start <= "20240430":
        title = "弱修复与信心不足调整"
        features = ["经济弱修复、资金风险偏好不足，指数震荡下行。"]
    elif "20240601" <= start <= "20240930":
        title = "弱修复尾段与政策预期等待"
        features = ["指数处在政策转向前的低位整理阶段。"]
    else:
        title = "阶段性熊市或整理"
        features = ["价格低于长期均线，风险偏好偏弱。"]

    return {
        "title": title,
        "themes": ["防御", "现金流", "高股息", "低估值"],
        "features": features,
        "basis": basis,
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
    probabilities = {
        "continue": continuation / total,
        "range": range_count / total,
        "weaken": weaken / total,
    }

    return {
        "basis": "historical_similar_samples",
        "basis_horizon_sessions": basis_horizon,
        "sample_size": int(total),
        "probabilities": probabilities,
        "paths": paths,
        "key_levels": {
            "current_close": round(float(latest["close"]), 4),
            "ma120": None if pd.isna(latest["ma120"]) else round(float(latest["ma120"]), 4),
            "ma250": None if pd.isna(latest["ma250"]) else round(float(latest["ma250"]), 4),
            "drawdown_60_pct": None if pd.isna(latest["drawdown_60"]) else round(float(latest["drawdown_60"]) * 100, 2),
        },
        "explanation": _forecast_explanation(
            latest=latest,
            state=current_state,
            sample_size=total,
            basis_horizon=basis_horizon,
            probabilities=probabilities,
            paths=paths,
        ),
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
        "explanation": {
            "summary": "历史相似样本不足，当前只展示关键位置，不输出概率结论。",
            "facts": _forecast_fact_lines(latest),
            "method": [
                "先确认当前所处的大周期状态，再在历史数据中寻找同状态且形态接近的交易日。",
                "如果相似样本数量不足，则不强行给出走势概率。",
            ],
            "result": "样本不足，概率应暂时视为不可用。",
        },
    }


def _forecast_explanation(
    *,
    latest: pd.Series,
    state: str,
    sample_size: int,
    basis_horizon: int,
    probabilities: dict,
    paths: list[dict],
) -> dict:
    dominant = max(
        [
            ("牛市延续", probabilities["continue"]),
            ("震荡整理", probabilities["range"]),
            ("转弱确认", probabilities["weaken"]),
        ],
        key=lambda item: item[1],
    )
    neutral_path = next((path for path in paths if path["horizon_sessions"] == basis_horizon), None)
    neutral_text = (
        f"{basis_horizon} 个交易日中性路径约 {neutral_path['neutral']:.2f}"
        if neutral_path
        else f"{basis_horizon} 个交易日中性路径暂无可用区间"
    )
    return {
        "summary": (
            f"当前展望来自历史相似样本统计，不是确定预测。按未来 {basis_horizon} 个交易日观察，"
            f"概率最高的是{dominant[0]}，占比约 {dominant[1]:.0%}。"
        ),
        "facts": _forecast_fact_lines(latest),
        "method": [
            f"先用 MA250 的 20 日确认规则判定当前仍处在{_cycle_state_label(state)}大周期，再只在相同大周期状态中找样本。",
            "相似度比较 5 个事实特征：距 MA250 的位置、近 60 日涨跌幅、20 日波动率、近 60 日最大回撤、本轮已运行交易日数。",
            f"取距离最近的 {sample_size} 个历史交易日作为样本，逐个观察之后 {basis_horizon} 个交易日的结果。",
            "若样本期后仍站上 MA250 且涨幅不低于 3%，记为牛市延续；若跌幅超过 8% 或跌破 MA250，记为转弱确认；其余记为震荡整理。",
        ],
        "result": (
            f"统计结果为：牛市延续 {probabilities['continue']:.1%}，"
            f"震荡整理 {probabilities['range']:.1%}，转弱确认 {probabilities['weaken']:.1%}；"
            f"{neutral_text}。"
        ),
    }


def _forecast_fact_lines(latest: pd.Series) -> list[str]:
    close = float(latest["close"])
    ma120 = None if pd.isna(latest["ma120"]) else float(latest["ma120"])
    ma250 = None if pd.isna(latest["ma250"]) else float(latest["ma250"])
    ma250_distance = None if pd.isna(latest["ma250_distance"]) else float(latest["ma250_distance"]) * 100
    return_60 = None if pd.isna(latest["return_60"]) else float(latest["return_60"]) * 100
    volatility = None if pd.isna(latest["volatility_20"]) else float(latest["volatility_20"]) * 100
    drawdown = None if pd.isna(latest["drawdown_60"]) else float(latest["drawdown_60"]) * 100
    elapsed = int(latest["cycle_elapsed_sessions"]) if not pd.isna(latest["cycle_elapsed_sessions"]) else None
    return [
        f"当前交易日：{latest['trade_date']}；上证收盘 {close:.2f}。",
        f"MA120：{_number_text(ma120)}；MA250：{_number_text(ma250)}；相对 MA250：{_pct_text(ma250_distance)}。",
        f"本轮大周期已运行 {elapsed or '--'} 个交易日；近 60 日涨跌幅 {_pct_text(return_60)}，近 60 日最大回撤 {_pct_text(drawdown)}。",
        f"20 日年化波动率约 {_pct_text(volatility)}。",
    ]


def _cycle_state_label(state: str) -> str:
    return {"bull": "牛市", "bear": "熊市"}.get(state, state)


def _number_text(value: float | None) -> str:
    return "--" if value is None else f"{value:.2f}"


def _pct_text(value: float | None) -> str:
    return "--" if value is None else f"{value:.2f}%"


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
