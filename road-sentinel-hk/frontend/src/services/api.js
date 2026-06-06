const BASE = window.location.hostname === "localhost"
  ? "http://localhost:8000"
  : `http://10.183.179.61:8000`;

export async function sendReport(payload) {
  const res = await fetch(`${BASE}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchHazards() {
  const res = await fetch(`${BASE}/hazards`);
  return res.json();
}

export async function fetchNearby(lat, lng, radius = 300) {
  const res = await fetch(`${BASE}/hazards/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
  return res.json();
}

export async function fetchWeather() {
  const res = await fetch(`${BASE}/weather`);
  return res.json();
}

export async function fetchGovernmentAlerts() {
  const res = await fetch(`${BASE}/government/alerts`);
  return res.json();
}

export function createWebSocket(onMessage) {
  const ws = new WebSocket(`ws://localhost:8000/ws`);

  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  };

  ws.onerror = (e) => console.error("WS error", e);

  ws.onclose = () => {
    // Reconnect after 3 seconds
    setTimeout(() => createWebSocket(onMessage), 3000);
  };

  return ws;
}
