import React, { useEffect, useState, useRef } from "react";
import Map from "../components/Map";
import { createWebSocket } from "../services/api";

const SEV_COLOR = (s) => s >= 7 ? "#ef4444" : s >= 4 ? "#f97316" : "#eab308";
const SEV_LABEL = (s) => s >= 7 ? "HIGH" : s >= 4 ? "MED" : "LOW";

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

  const critical = hazards.filter(h => h.severity >= 7);
  const sorted   = [...hazards].sort((a, b) => b.severity - a.severity).slice(0, 8);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#030b18" }}>

      {/* Critical warning bar */}
      {critical.length > 0 && (
        <div style={{
          background: "linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))",
          borderBottom: "1px solid rgba(239,68,68,0.4)",
          padding: "8px 20px",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <span style={{
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
            color: "#fff", padding: "3px 10px", borderRadius: 4,
            fontSize: 11, fontWeight: 900, letterSpacing: 1,
            boxShadow: "0 0 12px rgba(239,68,68,0.5)",
          }}>
            ⚠ CRITICAL
          </span>
          <span style={{ fontSize: 13, color: "#fca5a5", fontWeight: 600 }}>
            {critical.length} critical pothole{critical.length > 1 ? "s" : ""} detected — reduce speed immediately
          </span>
        </div>
      )}

      {/* Main layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Map hazards={hazards} onHazardClick={setSelected} />

        {/* Sidebar */}
        <div style={{
          width: 300, flexShrink: 0,
          background: "linear-gradient(180deg, rgba(6,18,40,0.98) 0%, rgba(3,11,24,0.98) 100%)",
          borderLeft: "1px solid rgba(0,212,255,0.12)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          backdropFilter: "blur(20px)",
        }}>

          {/* Header */}
          <div style={{ padding: "16px", borderBottom: "1px solid rgba(0,212,255,0.1)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(59,130,246,0.2))",
                border: "1px solid rgba(0,212,255,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>🕳️</div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 14, color: "#f1f5f9" }}>Live Hazard Feed</div>
                <div style={{ fontSize: 10, color: "#475569" }}>Real-time detections</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: wsStatus === "live" ? "#00d4ff" : "#f97316",
                  display: "inline-block",
                  boxShadow: wsStatus === "live" ? "0 0 8px #00d4ff" : "none",
                  animation: wsStatus === "live" ? "pulse 2s infinite" : "none",
                }} />
                <span style={{ fontSize: 10, color: wsStatus === "live" ? "#00d4ff" : "#f97316", fontWeight: 700 }}>
                  {wsStatus === "live" ? "LIVE" : wsStatus.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <MiniStat label="Total"  value={hazards.length}                                          color="#00d4ff" />
              <MiniStat label="High"   value={hazards.filter(h => h.severity >= 7).length}             color="#ef4444" />
              <MiniStat label="Medium" value={hazards.filter(h => h.severity >= 4 && h.severity < 7).length} color="#f97316" />
            </div>
          </div>

          {/* Hazard list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {sorted.length === 0 ? (
              <div style={{ padding: "40px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>🛣️</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#334155" }}>No potholes detected yet</div>
                <div style={{ fontSize: 11, color: "#1e293b", marginTop: 4 }}>Open Driver Mode to start scanning</div>
              </div>
            ) : sorted.map(h => (
              <div
                key={h.id}
                onClick={() => setSelected(h)}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(0,212,255,0.06)",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(0,212,255,0.05)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                    {h.road_name || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 4,
                    background: SEV_COLOR(h.severity) + "20",
                    color: SEV_COLOR(h.severity),
                    border: `1px solid ${SEV_COLOR(h.severity)}40`,
                    boxShadow: `0 0 6px ${SEV_COLOR(h.severity)}30`,
                  }}>
                    {SEV_LABEL(h.severity)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      width: `${h.severity * 10}%`, height: "100%",
                      background: `linear-gradient(90deg, ${SEV_COLOR(h.severity)}80, ${SEV_COLOR(h.severity)})`,
                      borderRadius: 2,
                      boxShadow: `0 0 6px ${SEV_COLOR(h.severity)}60`,
                    }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: SEV_COLOR(h.severity), flexShrink: 0, minWidth: 28, textAlign: "right" }}>
                    {h.severity.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 16px", borderTop: "1px solid rgba(0,212,255,0.1)",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, color: "#1e3a5f" }}>RoadSense · sensor fusion AI</span>
            <span style={{ fontSize: 10, color: "#1e3a5f" }}>↻ 5s</span>
          </div>
        </div>
      </div>

      {selected && <HazardPopup hazard={selected} onClose={() => setSelected(null)} />}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.2); border-radius: 2px; }
      `}</style>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color}20`,
      borderRadius: 8, padding: "8px 6px", textAlign: "center",
      boxShadow: `0 0 12px ${color}10`,
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color, textShadow: `0 0 12px ${color}80` }}>{value}</div>
      <div style={{ fontSize: 9, color: "#334155", fontWeight: 700, letterSpacing: 1, marginTop: 2 }}>{label.toUpperCase()}</div>
    </div>
  );
}

function HazardPopup({ hazard, onClose }) {
  const speed = hazard.severity >= 7 ? 10 : hazard.severity >= 4 ? 20 : 30;
  const color = SEV_COLOR(hazard.severity);
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: "rgba(6,18,40,0.95)", backdropFilter: "blur(20px)",
      border: `1px solid ${color}40`,
      borderRadius: 16, padding: "18px 22px", minWidth: 320,
      boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 30px ${color}20`,
      zIndex: 1000, display: "flex", alignItems: "center", gap: 18,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: `linear-gradient(135deg, ${color}20, ${color}10)`,
        border: `1px solid ${color}40`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
        boxShadow: `0 0 16px ${color}30`,
      }}>🕳️</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 3, color: "#f1f5f9" }}>
          Pothole Detected
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          {hazard.road_name || `${hazard.lat.toFixed(4)}, ${hazard.lng.toFixed(4)}`}
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>
          Severity {hazard.severity.toFixed(1)} · {Math.round(hazard.confidence * 100)}% confidence
        </div>
      </div>
      <div style={{ textAlign: "center", minWidth: 56 }}>
        <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1 }}>SLOW TO</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: "#00d4ff", lineHeight: 1, textShadow: "0 0 16px #00d4ff80" }}>{speed}</div>
        <div style={{ fontSize: 9, color: "#475569" }}>km/h</div>
      </div>
      <button onClick={onClose} style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        color: "#475569", fontSize: 16, cursor: "pointer", padding: "4px 8px", borderRadius: 6,
      }}>✕</button>
    </div>
  );
}
