from typing import Optional
from .accelerometer import AccelEvent
from .sound import SoundEvent
from .vision import VisionEvent

HAZARD_COLORS = {
    "pothole":    "#ef4444",
    "slippery":   "#f97316",
    "wet_road":   "#3b82f6",
    "rough_road": "#eab308",
    "bump":       "#8b5cf6",
}

SPEED_RECOMMENDATIONS = {
    "pothole":    {"low": 30, "medium": 20, "high": 10},
    "slippery":   {"low": 40, "medium": 25, "high": 15},
    "wet_road":   {"low": 50, "medium": 35, "high": 20},
    "rough_road": {"low": 40, "medium": 30, "high": 20},
    "bump":       {"low": 20, "medium": 15, "high": 10},
}

def fuse_signals(
    accel: Optional[AccelEvent],
    sound: Optional[SoundEvent],
    weather_multiplier: float = 1.0,
    vision: Optional[VisionEvent] = None,
) -> Optional[dict]:

    if accel is None and sound is None and vision is None:
        return None

    # Count active signals
    signals = [s for s in [accel, sound, vision] if s is not None]

    # All three agree — highest confidence
    if accel and sound and vision:
        types = {accel.event_type, sound.event_type, vision.event_type}
        if len(types) == 1:
            event_type = accel.event_type
            confidence = min(1.0, (accel.confidence * 0.5 + sound.confidence * 0.25 + vision.confidence * 0.25) * 1.3)
            severity   = accel.severity
        else:
            # Majority vote
            from collections import Counter
            winner = Counter([accel.event_type, sound.event_type, vision.event_type]).most_common(1)[0][0]
            event_type = winner
            confidence = accel.confidence * 0.6
            severity   = accel.severity

    # Two signals
    elif accel and vision:
        event_type = accel.event_type
        confidence = min(1.0, (accel.confidence * 0.65 + vision.confidence * 0.35) * 1.15)
        severity   = accel.severity
    elif accel and sound:
        if accel.event_type == sound.event_type:
            event_type = accel.event_type
            confidence = min(1.0, (accel.confidence * 0.6 + sound.confidence * 0.4) * 1.2)
            severity   = accel.severity
        else:
            event_type = accel.event_type
            confidence = accel.confidence * 0.75
            severity   = accel.severity
    elif sound and vision:
        event_type = sound.event_type if sound.confidence >= vision.confidence else vision.event_type
        confidence = min(1.0, (sound.confidence + vision.confidence) * 0.5)
        severity   = confidence * 6

    # Single signal
    elif accel:
        event_type = accel.event_type
        confidence = accel.confidence
        severity   = accel.severity
    elif vision:
        event_type = vision.event_type
        confidence = vision.confidence * 0.65
        severity   = vision.confidence * 5
    else:
        event_type = sound.event_type
        confidence = sound.confidence * 0.55
        severity   = sound.confidence * 5

    # Apply weather multiplier (rain makes everything worse)
    adjusted_severity = min(10.0, severity * weather_multiplier)

    severity_level = (
        "high"   if adjusted_severity >= 7 else
        "medium" if adjusted_severity >= 4 else
        "low"
    )

    speed_rec = SPEED_RECOMMENDATIONS.get(event_type, {}).get(severity_level, 30)

    return {
        "event_type":    event_type,
        "severity":      round(adjusted_severity, 1),
        "severity_level": severity_level,
        "confidence":    round(confidence, 2),
        "color":         HAZARD_COLORS.get(event_type, "#6b7280"),
        "speed_kmh":     speed_rec,
        "weather_boost": weather_multiplier > 1.0,
    }
