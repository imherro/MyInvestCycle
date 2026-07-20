from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import tempfile

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from strategy_rebase import (
    build_v15_point_in_time_snapshot_ledger,
    source_group_lineage_complete,
    validate_v15_point_in_time_snapshot_ledger,
    write_v15_point_in_time_snapshot_ledger,
)


def _valid_group() -> dict[str, object]:
    return {
        "snapshot_available": True,
        "observation_date": "20240101",
        "release_date": "20240102",
        "effective_date": "20240102",
        "captured_at": "2024-01-02T18:00:00+08:00",
        "source_version": "v1",
        "source_path": "snapshots/20240102/source.json",
        "source_sha256": "a" * 64,
        "source_sha256_origin": "historical_snapshot_file",
        "current_file_sha256": "b" * 64,
        "current_hash_is_historical_snapshot": True,
        "hash_verified": True,
    }


def test_each_required_lineage_field_blocks_verification() -> None:
    assert source_group_lineage_complete(_valid_group()) is True
    for field in ("captured_at", "release_date", "effective_date", "source_version", "source_sha256"):
        group = _valid_group()
        group[field] = None
        assert source_group_lineage_complete(group) is False, field


def test_current_file_hash_cannot_masquerade_as_historical_snapshot_hash() -> None:
    group = _valid_group()
    group["source_sha256"] = group["current_file_sha256"]
    group["source_sha256_origin"] = "current_local_file"
    group["current_hash_is_historical_snapshot"] = False
    assert source_group_lineage_complete(group) is False


def test_real_ledger_is_gap_report_only() -> None:
    ledger, status = build_v15_point_in_time_snapshot_ledger()
    assert status["ledger_status"] == "ledger_gap_report_ready"
    assert status["decision_date_count"] == 140
    assert status["snapshot_complete_count"] == 0
    assert status["strict_point_in_time_eligible_count"] == 0
    assert status["hash_verified_count"] == 0
    assert status["valuation_snapshot_available_count"] == 0
    assert status["backtest_allowed"] is False
    assert status["promotion_ready"] is False
    assert len(ledger["rows"]) == 140
    assert all(row["source_groups"]["valuation"]["snapshot_available"] is False for row in ledger["rows"])
    assert all(row["source_groups"]["macro"]["source_sha256"] is None for row in ledger["rows"])
    assert all(row["source_groups"]["macro"]["current_file_sha256"] for row in ledger["rows"])
    validate_v15_point_in_time_snapshot_ledger(ledger, status)
    with tempfile.TemporaryDirectory() as tmp:
        ledger_path, status_path = write_v15_point_in_time_snapshot_ledger(
            ledger,
            status,
            ledger_path=Path(tmp) / "ledger.json",
            status_path=Path(tmp) / "status.json",
        )
        assert ledger_path.exists() and status_path.exists()


def test_gap_status_cannot_return_rebuilt() -> None:
    ledger, status = build_v15_point_in_time_snapshot_ledger()
    invalid = deepcopy(status)
    invalid["ledger_status"] = "ledger_rebuilt"
    try:
        validate_v15_point_in_time_snapshot_ledger(ledger, invalid)
    except AssertionError:
        pass
    else:
        raise AssertionError("ledger_rebuilt must fail while gaps remain")


def main() -> None:
    test_each_required_lineage_field_blocks_verification()
    test_current_file_hash_cannot_masquerade_as_historical_snapshot_hash()
    test_real_ledger_is_gap_report_only()
    test_gap_status_cannot_return_rebuilt()
    print("test_v15_point_in_time_snapshot_ledger ok")


if __name__ == "__main__":
    main()
