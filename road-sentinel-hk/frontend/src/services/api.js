// All requests go through the Vite proxy → backend on :8000
// Using relative paths means HTTPS (frontend) proxies to HTTP (backend) server-side
// so the phone only needs to trust ONE cert (the Vite self-signed cert).

const WS_PROTOCOL = window.location.protocol === "https:" ? "wss" : "ws";
const WS_BASE = `${WS_PROTOCOL}://${window.location.host}`;

export async function sendReport(payload) {
  const res = await fetch("/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchHazards() {
  const res = await fetch("/hazards");
  return res.json();
}

export async function fetchNearby(lat, lng, radius = 300) {
  const res = await fetch(`/hazards/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
  return res.json();
}

export async function fetchWeather() {
  const res = await fetch("/weather");
  return res.json();
}

export async function fetchGovernmentAlerts() {
  const res = await fetch("/government/alerts");
  return res.json();
}

export async function resolveHazard(id) {
  const res = await fetch(`/hazards/${id}/resolve`, { method: "POST" });
  return res.json();
}

export async function reportHazardToGovernment(id) {
  const res = await fetch(`/hazards/${id}/report-government`, { method: "POST" });
  return res.json();
}

export function createWebSocket(onMessage) {
  const ws = new WebSocket(`${WS_BASE}/ws`);

  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  };

  ws.onerror = (e) => console.error("WS error", e);

  ws.onclose = () => {
    setTimeout(() => createWebSocket(onMessage), 3000);
  };

  return ws;
}
