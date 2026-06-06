import numpy as np
from dataclasses import dataclass
from typing import Optional, Tuple

@dataclass
class AccelEvent:
    event_type: str
    severity: float      # 0-10
    confidence: float    # 0-1
    raw_z: float
    raw_x: float

GRAVITY = 9.81

THRESHOLDS = {
    "pothole":    {"z_net": 4.0, "min_speed": 8},   # raised: needs real pothole impact
    "slippery":   {"x_net": 2.5, "min_speed": 25},  # raised: needs real lateral drift at speed
    "rough_road": {"z_net": 2.0, "min_speed": 8},   # raised: filters walking/handling
    "bump":       {"z_net": 2.5, "min_speed": 8},   # raised: needs real speed bump hit
}

def classify_road_event(
    z: float,
    x: float,
    y: float,
    speed_kmh: float
) -> Optional[AccelEvent]:

    if speed_kmh < 3:
        return None

    z_net = abs(z) - GRAVITY
    x_net = abs(x)

    # Pothole: sudden sharp vertical spike
    if z_net > THRESHOLDS["pothole"]["z_net"] and speed_kmh >= THRESHOLDS["pothole"]["min_speed"]:
        severity   = min(10.0, z_net * 1.8)
        confidence = min(1.0, z_net / 8.0)
        return AccelEvent("pothole", round(severity, 1), round(confidence, 2), z, x)

    # Slippery surface: lateral drift at speed
    if x_net > THRESHOLDS["slippery"]["x_net"] and speed_kmh >= THRESHOLDS["slippery"]["min_speed"]:
        severity   = min(10.0, x_net * 2.5)
        confidence = min(1.0, x_net / 5.0)
        return AccelEvent("slippery", round(severity, 1), round(confidence, 2), z, x)

    # Speed bump: gradual vertical rise
    if z_net > THRESHOLDS["bump"]["z_net"] and z_net < THRESHOLDS["pothole"]["z_net"]:
        severity   = min(5.0, z_net * 1.5)
        confidence = 0.75
        return AccelEvent("bump", round(severity, 1), confidence, z, x)

    # Rough road: sustained mid-level vibration
    if z_net > THRESHOLDS["rough_road"]["z_net"]:
        severity   = min(4.0, z_net)
        confidence = 0.6
        return AccelEvent("rough_road", round(severity, 1), confidence, z, x)

    return None


def compute_rolling_severity(readings: list) -> float:
    if not readings:
        return 0.0
    z_values = [abs(r["z"]) - GRAVITY for r in readings]
    return round(float(np.percentile(z_values, 90)), 2)
