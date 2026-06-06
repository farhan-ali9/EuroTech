// Device sensors for BumpLess: GPS + accelerometer only.

// ─── GPS ──────────────────────────────────────────────────────────────────────
export function startGPS(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError("Geolocation not supported");
    return null;
  }

  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : 0,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      }),
    (err) => onError(err.message),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );

  return () => navigator.geolocation.clearWatch(id);
}

// ─── ACCELEROMETER ──────────────────────────────────────────────────────────────
let _motionHandler = null;

export function startAccelerometer(onReading, onError) {
  // iOS 13+ requires explicit permission, triggered from a user gesture.
  if (
    typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function"
  ) {
    DeviceMotionEvent.requestPermission()
      .then((state) => {
        if (state === "granted") _listenMotion(onReading);
        else onError("Motion permission denied");
      })
      .catch((e) => onError(String(e)));
  } else if (typeof DeviceMotionEvent !== "undefined") {
    _listenMotion(onReading);
  } else {
    onError("DeviceMotion not supported (needs a mobile device over HTTPS)");
  }

  return () => {
    if (_motionHandler) window.removeEventListener("devicemotion", _motionHandler);
    _motionHandler = null;
  };
}

function _listenMotion(onReading) {
  _motionHandler = (e) => {
    const ag = e.accelerationIncludingGravity; // includes gravity — for display
    const a = e.acceleration; // linear only (gravity removed) — for detection
    if (!ag) return;
    onReading({
      x: ag.x ?? 0,
      y: ag.y ?? 0,
      z: ag.z ?? 0,
      lx: a?.x ?? 0,
      ly: a?.y ?? 0,
      lz: a?.z ?? 0,
      interval: e.interval,
    });
  };
  window.addEventListener("devicemotion", _motionHandler, { passive: true });
}

// ─── COMPASS / HEADING ──────────────────────────────────────────────────────────
// Direction the front of the phone points (0=N, clockwise), like Google Maps.
let _orientHandler = null;

export function startCompass(onHeading, onError) {
  const listen = () => {
    _orientHandler = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === "number" && !Number.isNaN(e.webkitCompassHeading)) {
        h = e.webkitCompassHeading; // iOS: degrees clockwise from north
      } else if (e.absolute && typeof e.alpha === "number") {
        h = (360 - e.alpha) % 360; // Android absolute orientation
      }
      if (h != null) onHeading(h);
    };
    window.addEventListener("deviceorientationabsolute", _orientHandler, { passive: true });
    window.addEventListener("deviceorientation", _orientHandler, { passive: true });
  };

  // iOS 13+ requires explicit permission (from a user gesture).
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((state) => (state === "granted" ? listen() : onError?.("Compass permission denied")))
      .catch((err) => onError?.(String(err)));
  } else if (typeof DeviceOrientationEvent !== "undefined") {
    listen();
  } else {
    onError?.("Compass not supported");
  }

  return () => {
    if (_orientHandler) {
      window.removeEventListener("deviceorientationabsolute", _orientHandler);
      window.removeEventListener("deviceorientation", _orientHandler);
    }
    _orientHandler = null;
  };
}
