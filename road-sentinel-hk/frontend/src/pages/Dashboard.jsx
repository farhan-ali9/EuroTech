import React, { useEffect, useState, useRef } from "react";
import Map from "../components/Map";
import { createWebSocket } from "../services/api";

const SEVERITY_COLOR = (s) => s >= 7 ? "#ef4444" : s >= 4 ? "#f97316" : "#eab308";
const SEVERITY_LABEL = (s) => s >= 7 ? "HIGH" : s >= 4 ? "MED" : "LOW";
const TYPE_ICONS = { pothole: "🕳️" };

export default function Dashboard() {
  const [hazards,  setHazards]  = useState([]);
  const [stats,    setStats]    = useState(null);
  const [selected, setSelected] = useState(null);
  const [wsStatus, setWsStatus] = useState("connecting");
  const wsRef = useRef(null);

  useEffect(() => {
    function connect() {
      const ws = createWebSocket((data) => {
        setHazards(data.hazards || []);
        setStats(data.stats    || null);
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

  const critical = hazards.filter((h) => h.severity >= 7);
  const sorted   = [...hazards].sort((a, b) => b.severity - a.severity).slice(0, 8);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>

      {/* Critical warning bar */}
      {critical.length > 0 && (
        <div style={{
          background: "#ff3b4a18",
          borderBottom: "1px solid #ff3b4a50",
          padding: "7px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ background: "#ef4444", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 800 }}>
            ⚠ SLOW DOWN
          </span>
          <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>
            {critical.length} critical hazard{critical.length > 1 ? "s" : ""} ahead — reduce speed
          </span>
        </div>
      )}

      {/* Main layout: map + sidebar */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Map */}
        <Map hazards={hazards} onHazardClick={setSelected} />

        {/* Sidebar */}
        <div style={{
          width: 280,
          flexShrink: 0,
          background: "#0d1525",
          borderLeft: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>🕳️</span>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Pothole Reports</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <MiniStat label="Total"  value={hazards.length}                              color="#f1f5f9" />
              <MiniStat label="High"   value={hazards.filter(h => h.severity >= 7).length} color="#ef4444" />
              <MiniStat label="Medium" value={hazards.filter(h => h.severity >= 4 && h.severity < 7).length} color="#f97316" />
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {sorted.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#475569", fontSize: 13 }}>
                No potholes reported yet.<br />
                <span style={{ fontSize: 11, color: "#334155" }}>Use Driver Mode to detect and report.</span>
              </div>
            ) : sorted.map((h) => (
              <div
                key={h.id}
                onClick={() => setSelected(h)}
                style={{ padding: "10px 14px", borderBottom: "1px solid #111827", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "#111827"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>
                    {h.road_name || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                    background: SEVERITY_COLOR(h.severity) + "20",
                    color: SEVERITY_COLOR(h.severity),
                  }}>
                    {SEVERITY_LABEL(h.severity)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${h.severity * 10}%`, height: "100%", background: SEVERITY_COLOR(h.severity), borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: SEVERITY_COLOR(h.severity), flexShrink: 0 }}>
                    {h.severity.toFixed(1)}
                  </span>
                </div>
                {h.source === "demo" && (
                  <div style={{ fontSize: 9, color: "#334155", marginTop: 3 }}>demo data</div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px", borderTop: "1px solid #1e293b",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: wsStatus === "live" ? "#22c55e" : "#f97316", display: "inline-block" }} />
              <span style={{ fontSize: 10, color: "#475569" }}>{wsStatus === "live" ? "Live" : wsStatus}</span>
            </div>
            <span style={{ fontSize: 10, color: "#334155" }}>updates every 5s</span>
          </div>
        </div>
      </div>

      {/* Hazard detail popup */}
      {selected && <SpeedWarning hazard={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: "#111827", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 9, color: "#475569", fontWeight: 700 }}>{label.toUpperCase()}</div>
    </div>
  );
}

function SpeedWarning({ hazard, onClose }) {
  const speed = hazard.severity >= 7 ? 10 : hazard.severity >= 4 ? 20 : 30;
  const color  = SEVERITY_COLOR(hazard.severity);

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      background: "#0d1525",
      border: `1px solid ${color}40`,
      borderRadius: 12,
      padding: "16px 20px",
      minWidth: 300,
      boxShadow: `0 8px 40px ${color}20`,
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      gap: 16,
    }}>
      <span style={{ fontSize: 28 }}>{TYPE_ICONS[hazard.event_type] || "⚠️"}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 14, textTransform: "capitalize", marginBottom: 2 }}>
          {hazard.event_type.replace("_", " ")}
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          {hazard.road_name || `${hazard.lat.toFixed(4)}, ${hazard.lng.toFixed(4)}`}
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#475569", fontWeight: 700 }}>SLOW TO</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#22c55e", lineHeight: 1 }}>{speed}</div>
        <div style={{ fontSize: 9, color: "#475569" }}>km/h</div>
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", fontSize: 18, cursor: "pointer", padding: 0 }}>×</button>
    </div>
  );
}
