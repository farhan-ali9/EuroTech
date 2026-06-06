import math
import numpy as np
from dataclasses import dataclass
from typing import Optional

@dataclass
class AccelEvent:
    event_type: str
    severity: float      # 0-10
    confidence: float    # 0-1
    raw_z: float
    raw_x: float

GRAVITY = 9.81

THRESHOLDS = {
    "pothole":    {"jolt": 4.0,  "min_speed": 8},
    "slippery":   {"lateral": 2.5, "min_speed": 25},
    "bump":       {"jolt": 2.5,  "min_speed": 8},
    "rough_road": {"jolt": 2.0,  "min_speed": 8},
}


def classify_road_event(
    z: float,
    x: float,
    y: float,
    speed_kmh: float,
    lx: float = 0.0,
    ly: float = 0.0,
    lz: float = 0.0,
) -> Optional[AccelEvent]:

    if speed_kmh < 3:
        return None

    # --- Orientation-independent jolt (preferred) ----------------------------
    # e.acceleration has gravity already removed by the device IMU.
    # sqrt(lx²+ly²+lz²) gives the net linear jolt regardless of how the
    # phone is held (portrait, landscape, flat, tilted in a car mount).
    linear_mag = math.sqrt(lx**2 + ly**2 + lz**2)

    # Fallback: phone didn't provide linear acceleration (older Android, etc.)
    # Use the classic z_net — only accurate when phone is roughly flat.
    z_net = max(0.0, abs(z) - GRAVITY)

    # Pick whichever signal is stronger / available
    jolt = linear_mag if linear_mag > 0.3 else z_net

    # Lateral force — use XY plane of linear accel when available
    lateral = math.sqrt(lx**2 + ly**2) if linear_mag > 0.3 else abs(x)

    # --- Pothole: sharp vertical jolt ----------------------------------------
    if jolt > THRESHOLDS["pothole"]["jolt"] and speed_kmh >= THRESHOLDS["pothole"]["min_speed"]:
        severity   = min(10.0, jolt * 1.8)
        confidence = min(1.0, jolt / 8.0)
        return AccelEvent("pothole", round(severity, 1), round(confidence, 2), z, x)

    # --- Slippery: lateral drift at speed ------------------------------------
    if lateral > THRESHOLDS["slippery"]["lateral"] and speed_kmh >= THRESHOLDS["slippery"]["min_speed"]:
        severity   = min(10.0, lateral * 2.5)
        confidence = min(1.0, lateral / 5.0)
        return AccelEvent("slippery", round(severity, 1), round(confidence, 2), z, x)

    # --- Speed bump: moderate jolt, below pothole threshold ------------------
    if THRESHOLDS["bump"]["jolt"] < jolt <= THRESHOLDS["pothole"]["jolt"] and speed_kmh >= THRESHOLDS["bump"]["min_speed"]:
        severity   = min(5.0, jolt * 1.5)
        return AccelEvent("bump", round(severity, 1), 0.75, z, x)

    # --- Rough road: sustained low-level vibration ---------------------------
    if jolt > THRESHOLDS["rough_road"]["jolt"] and speed_kmh >= THRESHOLDS["rough_road"]["min_speed"]:
        severity   = min(4.0, jolt)
        return AccelEvent("rough_road", round(severity, 1), 0.6, z, x)

    return None


def compute_rolling_severity(readings: list) -> float:
    if not readings:
        return 0.0
    z_values = [abs(r["z"]) - GRAVITY for r in readings]
    return round(float(np.percentile(z_values, 90)), 2)
