// Pluggable accelerometer source.
//
// An AccelSource is anything with `start(onReading, onError) -> stopFn`, where
// onReading receives a reading of shape { x, y, z, lx, ly, lz }.
// The detector and Driver view depend only on this contract, so the underlying
// hardware can be swapped without touching them.
//
// Switch with VITE_ACCEL_SOURCE ("phone" | "external"); defaults to "phone".
//   - "phone":    the device's built-in IMU (DeviceMotion). The only one built.
//   - "external": placeholder for an external sensor (e.g. ESP32 over BLE / local
//                 WebSocket) that emits the same reading shape. Not implemented.
//
// Note: a WiFi sensor (ESP32) can also bypass the phone entirely and POST detected
// defects straight to the backend `POST /report {lat,lng,severity}`.

import { startAccelerometer } from "./sensors";

function phoneSource() {
  return {
    start(onReading, onError) {
      return startAccelerometer(onReading, onError); // returns a stop function
    },
  };
}

function externalSource() {
  return {
    start(_onReading, onError) {
      onError?.("External accelerometer source is not implemented yet");
      return () => {};
    },
  };
}

export function createAccelSource(
  kind = import.meta.env.VITE_ACCEL_SOURCE || "phone"
) {
  switch (kind) {
    case "external":
      return externalSource();
    case "phone":
    default:
      return phoneSource();
  }
}
