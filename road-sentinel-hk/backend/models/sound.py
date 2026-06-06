from dataclasses import dataclass
from typing import Optional, Tuple
import math

@dataclass
class SoundEvent:
    event_type: str
    confidence: float

def classify_road_sound(features: dict) -> Optional[SoundEvent]:
    rms               = features.get("rms", 0)
    zcr               = features.get("zcr", 0)
    spectral_centroid = features.get("spectral_centroid", 0)
    peak_db           = features.get("peak_db", -60)
    low_freq_energy   = features.get("low_freq_energy", 0)
    high_freq_energy  = features.get("high_freq_energy", 0)

    # Pothole impact: sudden very loud low-frequency thud — raised threshold
    if peak_db > -8 and low_freq_energy > 0.75 and spectral_centroid < 1000:
        conf = min(1.0, (peak_db + 60) / 45 * low_freq_energy)
        return SoundEvent("pothole", round(conf, 2))

    # Wet road: sustained spray — requires strong signal to avoid ambient noise
    if zcr > 0.25 and rms > 0.08 and high_freq_energy > 0.65:
        conf = min(1.0, zcr * 3 * high_freq_energy)
        return SoundEvent("wet_road", round(conf, 2))

    # Tire squeal: strong high-frequency burst only
    if spectral_centroid > 3500 and rms > 0.12 and zcr > 0.28:
        conf = min(1.0, rms * 8)
        return SoundEvent("slippery", round(conf, 2))

    # Rough road: requires strong combined signal
    if zcr > 0.20 and low_freq_energy > 0.45 and peak_db > -15:
        conf = min(1.0, zcr * 2 * low_freq_energy)
        return SoundEvent("rough_road", round(conf, 2))

    return None


def estimate_features_from_amplitude(amplitude_data: list) -> dict:
    if not amplitude_data:
        return {}

    values = [abs(a) for a in amplitude_data]
    mean   = sum(values) / len(values)
    rms    = math.sqrt(sum(v**2 for v in values) / len(values))
    peak   = max(values)
    peak_db = 20 * math.log10(peak + 1e-10)

    crossings = sum(
        1 for i in range(1, len(amplitude_data))
        if amplitude_data[i] * amplitude_data[i-1] < 0
    )
    zcr = crossings / len(amplitude_data)

    # Rough frequency band estimation from ZCR and amplitude patterns
    low_freq_energy  = max(0, 1.0 - zcr * 5)
    high_freq_energy = min(1.0, zcr * 4)

    spectral_centroid = 500 + zcr * 8000

    return {
        "rms": round(rms, 4),
        "zcr": round(zcr, 4),
        "spectral_centroid": round(spectral_centroid, 1),
        "peak_db": round(peak_db, 1),
        "low_freq_energy": round(low_freq_energy, 3),
        "high_freq_energy": round(high_freq_energy, 3),
    }
