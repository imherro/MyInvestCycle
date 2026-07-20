from __future__ import annotations

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from strategy_rebase import (
    append_or_validate_forward_observation_journal,
    build_v15_daily_snapshot_capture,
    write_v15_daily_snapshot_capture,
    write_v15_forward_observation_journal_status,
)


def main() -> None:
    manifest, capture_status, decision = build_v15_daily_snapshot_capture()
    write_v15_daily_snapshot_capture(capture_status, decision)
    records, journal_status, appended = append_or_validate_forward_observation_journal(manifest, decision)
    status_path = write_v15_forward_observation_journal_status(journal_status)
    print(
        f"V15.8 snapshot={capture_status['snapshot_date']} records={len(records)} "
        f"pending={journal_status['pending_outcome_count']} appended={appended} status={status_path}"
    )


if __name__ == "__main__":
    main()
