// Bump detector — DEMO version.
//
// Severity comes from the vertical jolt: the component of motion acceleration
// along gravity ("down"), which is orientation-independent — works whether the
// phone is flat, upright, or tilted. The browser gives two readings per event;
// we derive gravity from them — gravity = accelerationIncludingGravity − acceleration —
// then project the (gravity-removed) acceleration onto it. (Same idea as iOS
// CoreMotion's userAcceleration · gravity.) Speed gating, windowed peaks,
// per-vehicle calibration and corroboration are still skipped here.

// Thresholds in m/s² (vertical g shown for reference). Tuned for a phone in a moving
// vehicle: the floor sits above road vibration and ordinary walking/handling (~0.3–0.5 g),
// and level 5 is a severe pothole hit (~2 g) — serious but still a road event, not a
// crash (airbags fire around ~15 g).
const MIN_STRENGTH = 5; // ≈0.5 g — below this isn't recorded (vibration / walking)
const COOLDOWN_MS = 1500; // one bump = one event

// Vertical jolt (m/s²): the motion acceleration projected onto gravity — i.e. the
// up/down acceleration regardless of phone orientation. Reading carries both the
// gravity-included (x,y,z) and gravity-removed (lx,ly,lz) acceleration.
export function downwardStrength(reading) {
  const { x = 0, y = 0, z = 0, lx = 0, ly = 0, lz = 0 } = reading || {};
  // gravity = accelerationIncludingGravity − acceleration (≈ 9.81 m/s², points down)
  const gx = x - lx;
  const gy = y - ly;
  const gz = z - lz;
  const gMag = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (gMag < 0.5) return Math.abs(lz); // fallback if the device gave no usable gravity
  return Math.abs((lx * gx + ly * gy + lz * gz) / gMag);
}

// Map vertical jolt strength (m/s²) to a 1-5 severity.
export function severityFromStrength(a) {
  if (a < 7.5) return 1; // 0.5–0.75 g — minor: small bump / rough patch
  if (a < 10) return 2; //  0.75–1.0 g — low: noticeable bump / mild pothole
  if (a < 15) return 3; //  1.0–1.5 g  — moderate pothole
  if (a < 20) return 4; //  1.5–2.0 g  — high: bad, jarring pothole
  return 5; //              ≥2.0 g     — severe pothole / hard hit
}

// onDefect({ severity }) is called once per detected bump.
export function createDetector(onDefect) {
  let lastFire = 0;

  return {
    feed(reading) {
      const strength = downwardStrength(reading); // vertical jolt along gravity (orientation-independent)

      if (strength <= MIN_STRENGTH) return;

      const now = Date.now();
      if (now - lastFire < COOLDOWN_MS) return;
      lastFire = now;

      onDefect({ severity: severityFromStrength(strength) });
    },
  };
}
