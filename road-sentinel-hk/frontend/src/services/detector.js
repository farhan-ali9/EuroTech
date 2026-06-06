// Bump detector — DEMO version.
//
// Severity is derived from ONE thing only: the up/down acceleration along the
// phone's screen-normal (z) axis — |z| = |acceleration.z| (gravity removed).
// When the phone lies flat, that's the vertical jolt. Everything else (speed
// gating, full-orientation handling, windowed peaks, per-vehicle calibration,
// corroboration) is intentionally ignored here. See the README ("Bump detection").

const MIN_STRENGTH = 3; // m/s² — below this isn't recorded
const COOLDOWN_MS = 1500; // one bump = one event

// Map vertical (z-axis) jolt strength (m/s²) to a 1-5 severity.
export function severityFromStrength(a) {
  if (a < 5) return 1;
  if (a < 6) return 2;
  if (a < 7) return 3;
  if (a < 10) return 4;
  return 5;
}

// onDefect({ severity, strength }) is called once per detected bump.
export function createDetector(onDefect) {
  let lastFire = 0;

  return {
    feed(reading) {
      const { lz = 0 } = reading || {};
      const strength = Math.abs(lz); // z-axis only: up/down through the screen (gravity removed)

      if (strength <= MIN_STRENGTH) return;

      const now = Date.now();
      if (now - lastFire < COOLDOWN_MS) return;
      lastFire = now;

      onDefect({ severity: severityFromStrength(strength), strength: Math.round(strength * 10) / 10 });
    },
  };
}
