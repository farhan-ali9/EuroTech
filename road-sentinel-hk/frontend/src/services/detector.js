// Bump detector — turns the live accelerometer stream into discrete defect events.
// Runs entirely on the device; only the resulting {severity} (+ GPS) is sent to the backend.

const MIN_JOLT = 2.0; // m/s² — below this is normal road noise
const MIN_SPEED_KMH = 8; // ignore phone handling while parked / walking
const COOLDOWN_MS = 2500; // one pothole = one event

// Map jolt magnitude (m/s²) to a 1-5 severity.
export function severityFromJolt(jolt) {
  if (jolt < 3) return 1;
  if (jolt < 4) return 2;
  if (jolt < 6) return 3;
  if (jolt < 8) return 4;
  return 5;
}

// onDefect({ severity, jolt }) is called once per detected bump.
export function createDetector(onDefect) {
  let lastFire = 0;

  return {
    // Feed one accelerometer reading + the current GPS speed.
    feed(reading, speedKmh) {
      if (speedKmh < MIN_SPEED_KMH) return;

      const { lx = 0, ly = 0, lz = 0, z = 0 } = reading || {};

      // Orientation-independent linear jolt; fall back to z-gravity if the
      // device gave no linear acceleration.
      let jolt = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (jolt < 0.3) jolt = Math.max(0, Math.abs(z) - 9.81);

      if (jolt <= MIN_JOLT) return;

      const now = Date.now();
      if (now - lastFire < COOLDOWN_MS) return;
      lastFire = now;

      onDefect({ severity: severityFromJolt(jolt), jolt: Math.round(jolt * 10) / 10 });
    },
  };
}
