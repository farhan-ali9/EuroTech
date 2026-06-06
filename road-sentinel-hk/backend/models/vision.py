import base64
import cv2
import numpy as np
from dataclasses import dataclass
from typing import Optional


@dataclass
class VisionEvent:
    event_type: str
    confidence: float
    details: dict


def analyse_frame(frame_b64: str) -> Optional[VisionEvent]:
    try:
        header, data = frame_b64.split(",", 1)
        img_bytes = base64.b64decode(data)
        arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

        if img is None:
            return None

        img = cv2.resize(img, (320, 240))

        # Bottom 40–95% = road surface (avoid sky at top, car hood at very bottom)
        h = img.shape[0]
        road_region = img[int(h * 0.40): int(h * 0.95), :]

        pothole = _detect_pothole(road_region)
        water   = _detect_standing_water(road_region)
        crack   = _detect_crack(road_region)

        candidates = [e for e in [pothole, water, crack] if e is not None]
        if not candidates:
            return None

        return max(candidates, key=lambda e: e.confidence)

    except Exception:
        return None


def _detect_pothole(region: np.ndarray) -> Optional[VisionEvent]:
    gray    = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 0)

    rh, rw  = region.shape[:2]
    region_area = rh * rw

    # ── Method 1: adaptive local darkness ───────────────────────────────────
    # Finds patches darker than their LOCAL neighbourhood — works in any light
    adaptive = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=51,   # neighbourhood size (must be odd)
        C=12,           # how many grey levels darker than neighbourhood
    )

    # ── Method 2: relative global darkness ──────────────────────────────────
    # Pothole is significantly darker than the average road surface
    road_mean = float(np.mean(blurred))
    dark_threshold = max(35, road_mean * 0.72)
    _, dark_global = cv2.threshold(blurred, dark_threshold, 255, cv2.THRESH_BINARY_INV)

    # Combine both dark masks
    combined = cv2.bitwise_or(adaptive, dark_global)

    # ── Method 3: edge density (potholes have sharp boundaries) ─────────────
    edges = cv2.Canny(blurred, 25, 90)
    edge_dilated = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=2)

    # Dark region that also has nearby edges = very likely pothole
    with_edges = cv2.bitwise_and(combined, edge_dilated)
    final_mask = cv2.bitwise_or(combined, with_edges)

    # Morphological cleanup — close small gaps, remove tiny speckles
    kernel  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    cleaned = cv2.morphologyEx(final_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    cleaned = cv2.morphologyEx(cleaned,    cv2.MORPH_OPEN,  np.ones((3, 3), np.uint8))

    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    valid = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 300 or area > region_area * 0.40:
            continue

        x, y, cw, ch = cv2.boundingRect(c)
        aspect = cw / max(ch, 1)
        if not (0.2 < aspect < 5.0):
            continue

        # Circularity — potholes are oval/round, not thin lines
        perimeter = cv2.arcLength(c, True)
        if perimeter == 0:
            continue
        circularity = 4 * np.pi * area / (perimeter ** 2)

        # Edge density inside the contour
        mask_c = np.zeros(edges.shape, np.uint8)
        cv2.drawContours(mask_c, [c], -1, 255, -1)
        edge_px      = cv2.countNonZero(cv2.bitwise_and(edges, mask_c))
        edge_density = edge_px / max(area, 1)

        # Multi-factor score
        score = 0.0
        if 0.15 < circularity < 0.92:   score += 0.30
        if edge_density > 0.08:          score += 0.25
        if 400 < area < region_area * 0.25: score += 0.25
        if 0.3 < aspect < 3.5:          score += 0.20

        if score >= 0.40:
            valid.append({"area": area, "aspect": aspect,
                          "circularity": round(circularity, 2), "score": score})

    if not valid:
        return None

    total_area   = sum(v["area"] for v in valid)
    coverage_pct = total_area / region_area

    if coverage_pct < 0.003:
        return None

    avg_score  = sum(v["score"] for v in valid) / len(valid)
    confidence = min(1.0, coverage_pct * 12 + len(valid) * 0.10 + avg_score * 0.25)

    return VisionEvent(
        event_type="pothole",
        confidence=round(confidence, 2),
        details={
            "patches":      len(valid),
            "coverage_pct": round(coverage_pct * 100, 1),
            "avg_score":    round(avg_score, 2),
            "road_mean_brightness": round(road_mean, 1),
        },
    )


def _detect_standing_water(region: np.ndarray) -> Optional[VisionEvent]:
    hsv     = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    gray    = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 0)

    # Reflective water = high brightness + low saturation
    bright_mask = cv2.inRange(blurred, 175, 255)
    low_sat     = cv2.inRange(hsv[:, :, 1], 0, 55)
    water_mask  = cv2.bitwise_and(bright_mask, low_sat)

    kernel  = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 3))
    cleaned = cv2.morphologyEx(water_mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid = [c for c in contours if cv2.contourArea(c) > 600]

    if not valid:
        return None

    total_area   = sum(cv2.contourArea(c) for c in valid)
    region_area  = region.shape[0] * region.shape[1]
    coverage_pct = total_area / region_area

    if coverage_pct < 0.025:
        return None

    confidence = min(1.0, coverage_pct * 9)

    return VisionEvent(
        event_type="wet_road",
        confidence=round(confidence, 2),
        details={"water_patches": len(valid),
                 "coverage_pct": round(coverage_pct * 100, 1)},
    )


def _detect_crack(region: np.ndarray) -> Optional[VisionEvent]:
    gray    = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges   = cv2.Canny(blurred, 35, 110)

    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=25,
                             minLineLength=20, maxLineGap=10)
    if lines is None:
        return None

    crack_lines = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle  = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
        length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        # Exclude purely horizontal (road markings) and purely vertical (image edge)
        if (10 < angle < 80) or (100 < angle < 170):
            crack_lines.append(length)

    if len(crack_lines) < 3:
        return None

    confidence = min(1.0, len(crack_lines) * 0.055)

    return VisionEvent(
        event_type="rough_road",
        confidence=round(confidence, 2),
        details={"crack_lines": len(crack_lines),
                 "avg_length":  round(float(np.mean(crack_lines)), 1)},
    )
