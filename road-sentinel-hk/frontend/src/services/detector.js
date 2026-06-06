// Bump detector — DEMO version.
//
// Severity is derived from ONE thing only: the absolute strength of the
// acceleration the phone feels, i.e. the magnitude of the (gravity-removed)
// acceleration vector:  |a| = sqrt(lx² + ly² + lz²).
// Everything else (speed gating, vertical-axis isolation, windowed peaks,
// per-vehicle calibration, corroboration) is intentionally ignored here so the
// demo is trivial to reason about and you can test it just by shaking the phone.
// See the README ("Bump detection") for how this should work in production.

const MIN_STRENGTH = 7; // m/s² — below this isn't recorded (less sensitive)
const COOLDOWN_MS = 1500; // one bump = one event

// Map absolute acceleration strength (m/s²) to a 1-5 severity.
// Scale shifted up so a firmer jolt is needed: what used to read "3" is now "1".
export function severityFromStrength(a) {
  if (a < 11) return 1;
  if (a < 16) return 2;
  if (a < 22) return 3;
  if (a < 30) return 4;
  return 5;
}

// onDefect({ severity, strength }) is called once per detected bump.
export function createDetector(onDefect) {
  let lastFire = 0;

  return {
    feed(reading) {
      const { lx = 0, ly = 0, lz = 0 } = reading || {};
      const strength = Math.sqrt(lx * lx + ly * ly + lz * lz); // |a|, gravity already removed

      if (strength <= MIN_STRENGTH) return;

      const now = Date.now();
      if (now - lastFire < COOLDOWN_MS) return;
      lastFire = now;

      onDefect({ severity: severityFromStrength(strength), strength: Math.round(strength * 10) / 10 });
    },
  };
}
