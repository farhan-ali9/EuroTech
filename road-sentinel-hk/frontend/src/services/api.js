// All requests use relative paths → the Vite dev-server proxy forwards them to the
// backend on :8000 (see vite.config.js). Keeps everything same-origin, so the phone
// only needs ONE URL and no hardcoded backend IP.

export async function sendReport({ lat, lng, severity }) {
  const res = await fetch("/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, severity }),
  });
  return res.json();
}

export async function fetchHazards() {
  const res = await fetch("/hazards");
  return res.json();
}

export async function fetchNearby(lat, lng, radius = 1000) {
  const res = await fetch(`/hazards/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
  return res.json();
}
