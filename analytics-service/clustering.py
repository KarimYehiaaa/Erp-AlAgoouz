"""
clustering.py — Backward-compatibility re-export shim.
══════════════════════════════════════════════════════
The modules have been properly separated into:
  - menu_engineering.py (Kasavana & Smith Menu Engineering Matrix)
  - churn_risk.py (Heuristic RFM Churn Risk Scoring)

This module maintains backward-compatibility for existing imports.
"""
from menu_engineering import compute_menu_matrix
from churn_risk import compute_churn_risk

__all__ = ["compute_menu_matrix", "compute_churn_risk"]
