"""Unit tests for the clustering service and haversine helper.

The database module is stubbed out so these tests run without Postgres.
"""
import sys
from unittest.mock import MagicMock

# Stub `database` before clustering.py imports it.
_db = MagicMock()
_db.load_all_defects.return_value = []
sys.modules["database"] = _db

from services.clustering import ClusteringService, haversine_m  # noqa: E402


# ── haversine_m ───────────────────────────────────────────────────────────────

def test_haversine_same_point():
    assert haversine_m(22.3193, 114.1694, 22.3193, 114.1694) == 0.0


def test_haversine_one_degree_latitude():
    # 1° of latitude ≈ 111,195 m
    d = haversine_m(0.0, 0.0, 1.0, 0.0)
    assert 111_000 < d < 112_000


def test_haversine_50m():
    # ~50 m north of a point (≈ 0.00045°)
    d = haversine_m(22.3193, 114.1694, 22.31975, 114.1694)
    assert 45 < d < 55


# ── ClusteringService ─────────────────────────────────────────────────────────

def make_svc():
    _db.reset_mock()
    _db.load_all_defects.return_value = []
    return ClusteringService()


def test_first_report_creates_defect():
    svc = make_svc()
    did, is_new = svc.add_defect(22.3193, 114.1694, 3)
    assert is_new is True
    assert len(svc.all_defects()) == 1
    assert svc.all_defects()[0]["severity"] == 3


def test_nearby_report_merges():
    svc = make_svc()
    did1, _ = svc.add_defect(22.3193, 114.1694, 2)
    # ~20 m away — within the 50 m cluster radius
    did2, is_new = svc.add_defect(22.31948, 114.1694, 2)
    assert is_new is False
    assert did1 == did2
    assert svc.all_defects()[0]["report_count"] == 2


def test_far_report_is_new_defect():
    svc = make_svc()
    svc.add_defect(22.3193, 114.1694, 2)
    # ~200 m away — outside the 50 m radius
    _, is_new = svc.add_defect(22.3211, 114.1694, 2)
    assert is_new is True
    assert len(svc.all_defects()) == 2


def test_merge_takes_max_severity():
    svc = make_svc()
    did, _ = svc.add_defect(22.3193, 114.1694, 1)
    svc.add_defect(22.31932, 114.1694, 5)  # same cluster, higher severity
    assert svc.all_defects()[0]["severity"] == 5


def test_severity_clamped():
    svc = make_svc()
    svc.add_defect(22.3193, 114.1694, 0)   # below 1
    svc.add_defect(22.3211, 114.1694, 99)  # above 5
    defects = {d["severity"] for d in svc.all_defects()}
    assert defects == {1, 5}


def test_remove_defect():
    svc = make_svc()
    did, _ = svc.add_defect(22.3193, 114.1694, 3)
    assert svc.remove_defect(did) is True
    assert svc.remove_defect(did) is False
    assert svc.all_defects() == []


def test_defects_near_filters_by_radius():
    svc = make_svc()
    svc.add_defect(22.3193, 114.1694, 3)   # origin
    svc.add_defect(22.3211, 114.1694, 2)   # ~200 m away
    near = svc.defects_near(22.3193, 114.1694, 100)
    assert len(near) == 1
    assert near[0]["severity"] == 3
