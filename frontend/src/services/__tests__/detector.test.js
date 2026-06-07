import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downwardStrength, severityFromStrength, createDetector } from "../detector.js";

// ── downwardStrength ──────────────────────────────────────────────────────────

describe("downwardStrength", () => {
  it("returns vertical jolt for a phone lying flat (z-gravity)", () => {
    // gravity = (0, 0, 9.81); linear accel = (0, 0, 5) → vertical jolt = 5
    const r = { x: 0, y: 0, z: 14.81, lx: 0, ly: 0, lz: 5 };
    expect(downwardStrength(r)).toBeCloseTo(5, 1);
  });

  it("ignores a pure horizontal shake", () => {
    // Phone flat face-up: gravity = (0, 0, -9.81), horizontal linear accel = (5, 0, 0)
    // accelerationIncludingGravity = (5, 0, -9.81)
    const r = { x: 5, y: 0, z: -9.81, lx: 5, ly: 0, lz: 0 };
    expect(downwardStrength(r)).toBeCloseTo(0, 1);
  });

  it("returns 0 for an empty reading", () => {
    expect(downwardStrength(null)).toBe(0);
    expect(downwardStrength({})).toBe(0);
  });
});

// ── severityFromStrength ──────────────────────────────────────────────────────

describe("severityFromStrength", () => {
  it.each([
    [0, 1],
    [2.5, 1],   // 0.25 g — just above floor
    [3.9, 1],   // just below level-2 boundary
    [4.0, 2],   // boundary: not < 4, so level 2
    [5.4, 2],
    [5.5, 3],
    [7.4, 3],
    [7.5, 4],
    [9.9, 4],
    [10.0, 5],
    [20.0, 5],
  ])("strength %f → severity %i", (strength, expected) => {
    expect(severityFromStrength(strength)).toBe(expected);
  });
});

// ── createDetector ────────────────────────────────────────────────────────────

describe("createDetector", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const bigBump = { x: 0, y: 0, z: 14.81, lx: 0, ly: 0, lz: 5 }; // ~5 m/s² vertical
  const smallVibration = { x: 0, y: 0, z: 10.81, lx: 0, ly: 0, lz: 1 }; // ~1 m/s² — below MIN_STRENGTH

  it("fires onDefect when jolt exceeds the threshold", () => {
    const cb = vi.fn();
    createDetector(cb).feed(bigBump);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0]).toHaveProperty("severity");
  });

  it("does not fire for a sub-threshold vibration", () => {
    const cb = vi.fn();
    createDetector(cb).feed(smallVibration);
    expect(cb).not.toHaveBeenCalled();
  });

  it("respects the cooldown — one pothole = one event", () => {
    const cb = vi.fn();
    const det = createDetector(cb);
    det.feed(bigBump);
    det.feed(bigBump); // within COOLDOWN_MS
    expect(cb).toHaveBeenCalledOnce();
  });

  it("fires again after the cooldown expires", () => {
    const cb = vi.fn();
    const det = createDetector(cb);
    det.feed(bigBump);
    vi.advanceTimersByTime(1600); // past COOLDOWN_MS (1500 ms)
    det.feed(bigBump);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
