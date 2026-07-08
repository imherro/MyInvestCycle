from asset_opportunity.asset_loader import asset_history_coverage, load_asset_history
from asset_opportunity.asset_registry import DEFAULT_ASSETS, build_asset_registry, read_asset_registry, write_asset_registry
from asset_opportunity.asset_schema import AssetRecord
from asset_opportunity.opportunity_score_engine import build_asset_opportunity_snapshot

__all__ = [
    "AssetRecord",
    "DEFAULT_ASSETS",
    "asset_history_coverage",
    "build_asset_opportunity_snapshot",
    "build_asset_registry",
    "load_asset_history",
    "read_asset_registry",
    "write_asset_registry",
]
