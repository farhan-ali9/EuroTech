import React, { useEffect, useState, useRef } from "react";
import Map from "../components/Map";
import HazardList from "../components/HazardList";
import WeatherBanner from "../components/WeatherBanner";
import { createWebSocket } from "../services/api";

export default function Dashboard() {
  const [hazards,  setHazards]  = useState([]);
  const [weather,  setWeather]  = useState(null);
  const [stats,    setStats]    = useState(null);
  const [selected, setSelected] = useState(null);
  const [wsStatus, setWsStatus] = useState("connecting");
  const wsRef = useRef(null);

  useEffect(() => {
    function connect() {
      const ws = createWebSocket((data) => {
        setHazards(data.hazards  || []);
        setWeather(data.weather  || null);
        setStats(data.stats      || null);
        setWsStatus("live");
      });

      ws.onopen  = () => setWsStatus("live");
      ws.onclose = () => { setWsStatus("reconnecting"); setTimeout(connect, 3000); };
      ws.onerror = () => setWsStatus("error");
      wsRef.current = ws;
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  const criticalHazards = hazards.filter((h) => h.severity >= 7);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <WeatherBanner weather={weather} />

      {criticalHazards.length > 0 && (
        <div style={{
          background: "#ff3b4a15",
          borderBottom: "1px solid #ff3b4a40",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{
            background: "#ff3b4a",
            color: "white",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 800,
            animation: "pulse 1.5s infinite",
            boxShadow: "0 0 12px rgba(255, 59, 74, 0.4)",
          }}>
            CRITICAL
          </span>
          <span style={{ fontSize: 13, color: "#ff3b4a", fontWeight: 600 }}>
            {criticalHazards.length} critical road hazard{criticalHazards.length > 1 ? "s" : ""} detected
          </span>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Map
          hazards={hazards}
          onHazardClick={setSelected}
        />

        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", width: 300, flexShrink: 0 }}>
          <HazardList
            hazards={hazards}
            stats={stats}
            onSelect={setSelected}
          />

          <div style={{
            padding: "10px 14px",
            borderTop: "1px solid #334155",
            borderLeft: "1px solid #334155",
            background: "#0f172a",
            fontSize: 11,
            color: "#64748b",
            display: "flex",
            justifyContent: "space-between",
          }}>
            <span>
              <span style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: wsStatus === "live" ? "#2dd4bf" : "#ff3b4a",
                marginRight: 5,
              }} />
              {wsStatus === "live" ? "Live feed connected" : wsStatus}
            </span>
            <span>Updates every 5s</span>
          </div>
        </div>
      </div>

      {selected && (
        <HazardDetail hazard={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function HazardDetail({ hazard, onClose }) {
  const speedRec = hazard.severity >= 7 ? 10 : hazard.severity >= 4 ? 20 : 30;

  return (
    <div style={{
      position: "fixed",
      bottom: 20,
      left: "50%",
      transform: "translateX(-50%)",
      background: "#131b2e",
      border: "1px solid #1e2d47",
      borderRadius: 12,
      padding: 20,
      minWidth: 340,
      boxShadow: "0 20px 80px rgba(0, 217, 255, 0.12)",
      zIndex: 1000,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 15, textTransform: "capitalize" }}>
          {hazard.event_type.replace("_", " ")}
        </span>
        <button onClick={onClose} style={{ background: "none", color: "#94a3b8", fontSize: 18 }}>×</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Metric label="Severity"    value={`${hazard.severity.toFixed(1)} / 10`} />
        <Metric label="Reports"     value={hazard.report_count} />
        <Metric label="Confidence"  value={`${Math.round(hazard.confidence * 100)}%`} />
      </div>

      <div style={{
        background: "#0f172a",
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <span style={{ fontSize: 24 }}>🚗</span>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Recommended speed</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2dd4bf" }}>{speedRec} km/h</div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={{ background: "#0f172a", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 16 }}>{value}</div>
    </div>
  );
}
