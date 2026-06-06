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
POTHOLE_JOLT_THRESHOLD = 2.0
MIN_SPEED_KMH = 5


def classify_road_event(
    z: float,
    x: float,
    y: float,
    speed_kmh: float,
    lx: float = 0.0,
    ly: float = 0.0,
    lz: float = 0.0,
) -> Optional[AccelEvent]:

    if speed_kmh < MIN_SPEED_KMH:
        return None

    # Orientation-independent jolt: use linear acceleration (gravity removed by IMU).
    # Falls back to z_net when linear accel is unavailable (older devices).
    linear_mag = math.sqrt(lx**2 + ly**2 + lz**2)
    z_net = max(0.0, abs(z) - GRAVITY)
    jolt = linear_mag if linear_mag > 0.3 else z_net

    if jolt > POTHOLE_JOLT_THRESHOLD:
        severity   = min(10.0, jolt * 1.8)
        confidence = min(1.0, jolt / 8.0)
        return AccelEvent("pothole", round(severity, 1), round(confidence, 2), z, x)

    return None


def compute_rolling_severity(readings: list) -> float:
    if not readings:
        return 0.0
    z_values = [abs(r["z"]) - GRAVITY for r in readings]
    return round(float(np.percentile(z_values, 90)), 2)
