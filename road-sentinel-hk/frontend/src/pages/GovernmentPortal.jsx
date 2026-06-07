import React, { useEffect, useState } from "react";
import { fetchGovernmentAlerts, reportHazardToGovernment, resolveHazard, clearAllHazards } from "../services/api";

const SEV_COLOR = (s) => s >= 7 ? "#ef4444" : s >= 4 ? "#f97316" : "#eab308";
const SEV_LABEL = (s) => s >= 7 ? "CRITICAL" : s >= 4 ? "MODERATE" : "LOW";

export default function GovernmentPortal() {
  const [hazards,   setHazards]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

  const load = async () => {
    try {
      const data = await fetchGovernmentAlerts();
      setHazards(data.alerts || []);
      setLastFetch(new Date().toLocaleTimeString());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const handleReport = async (id) => {
    await reportHazardToGovernment(id);
    setHazards(h => h.map(x => x.id === id ? { ...x, government_reported: true, reported_at: new Date().toISOString() } : x));
  };

  const handleResolve = async (id) => {
    await resolveHazard(id);
    setHazards(h => h.filter(x => x.id !== id));
  };

  const critical = hazards.filter(h => h.severity >= 7);
  const moderate = hazards.filter(h => h.severity >= 4 && h.severity < 7);
  const low      = hazards.filter(h => h.severity < 4);
  const reported = hazards.filter(h => h.government_reported);

  // Group by district
  const byDistrict = hazards.reduce((acc, h) => {
    const d = h.district || "Unknown";
    if (!acc[d]) acc[d] = { critical: 0, moderate: 0, low: 0 };
    if (h.severity >= 7) acc[d].critical++;
    else if (h.severity >= 4) acc[d].moderate++;
    else acc[d].low++;
    return acc;
  }, {});
  const districtRows = Object.entries(byDistrict).sort((a, b) =>
    (b[1].critical * 3 + b[1].moderate) - (a[1].critical * 3 + a[1].moderate)
  );

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "linear-gradient(180deg, #030b18 0%, #020810 100%)", color: "#f1f5f9" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 28 }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          marginBottom: 28, paddingBottom: 24,
          borderBottom: "1px solid rgba(0,212,255,0.1)",
        }}>
          <div>
            <div style={{
              fontSize: 22, fontWeight: 900, marginBottom: 6,
              background: "linear-gradient(135deg, #f1f5f9, #94a3b8)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              🏛️ Bundesanstalt für Straßenwesen (BASt)
            </div>
            <div style={{ fontSize: 12, color: "#334155" }}>
              Real-time driver-detected potholes · AI sensor fusion · Integrated with BASt road maintenance
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)",
              padding: "5px 14px", borderRadius: 20,
              boxShadow: "0 0 12px rgba(0,212,255,0.1)",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00d4ff", display: "inline-block", boxShadow: "0 0 6px #00d4ff", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: "#00d4ff", letterSpacing: 1 }}>LIVE</span>
            </div>
            {lastFetch && <div style={{ fontSize: 10, color: "#1e3a5f" }}>Updated {lastFetch}</div>}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={exportCSV.bind(null, hazards)} style={{
                background: "rgba(255,255,255,0.04)", color: "#64748b",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
                padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 700,
              }}>⬇ Export CSV</button>
              <button onClick={async () => { if (confirm("Clear ALL hazard data?")) { await clearAllHazards(); setHazards([]); } }} style={{
                background: "rgba(239,68,68,0.1)", color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8,
                padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 700,
              }}>🗑 Clear All</button>
            </div>
          </div>
        </div>

        {/* ── Summary stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          <StatCard icon="📋" label="Total Reported" value={hazards.length}   color="#00d4ff" />
          <StatCard icon="🚨" label="Critical"        value={critical.length} color="#ef4444" />
          <StatCard icon="⚠️" label="Moderate"        value={moderate.length} color="#f97316" />
          <StatCard icon="📨" label="Sent to Govt"    value={reported.length} color="#10b981" />
        </div>

        {/* ── Critical alert banner ── */}
        {critical.length > 0 && (
          <div style={{
            background: "linear-gradient(90deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))",
            border: "1px solid rgba(239,68,68,0.3)", borderRadius: 14,
            padding: "16px 20px", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 16,
            boxShadow: "0 4px 20px rgba(239,68,68,0.1)",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
            }}>🚨</div>
            <div>
              <div style={{ fontWeight: 900, color: "#ef4444", fontSize: 14, letterSpacing: 0.5 }}>
                {critical.length} CRITICAL POTHOLE{critical.length > 1 ? "S" : ""} — IMMEDIATE REPAIR REQUIRED
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                Severity ≥ 7/10 · High risk of vehicle damage and accidents
              </div>
            </div>
          </div>
        )}

        {/* ── District breakdown ── */}
        {districtRows.length > 0 && (
          <div style={{
            background: "rgba(6,18,40,0.8)", backdropFilter: "blur(20px)",
            border: "1px solid rgba(0,212,255,0.1)", borderRadius: 14,
            padding: "18px 20px", marginBottom: 24,
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#00d4ff", letterSpacing: 2, marginBottom: 14 }}>
              📍 BY DISTRICT
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#475569", fontWeight: 700 }}>
                  <td style={{ paddingBottom: 8 }}>District</td>
                  <td style={{ textAlign: "center", paddingBottom: 8, color: "#ef4444" }}>Critical</td>
                  <td style={{ textAlign: "center", paddingBottom: 8, color: "#f97316" }}>Moderate</td>
                  <td style={{ textAlign: "center", paddingBottom: 8, color: "#eab308" }}>Low</td>
                </tr>
              </thead>
              <tbody>
                {districtRows.map(([district, counts]) => (
                  <tr key={district} style={{ borderTop: "1px solid #1e293b" }}>
                    <td style={{ padding: "8px 0", color: "#f1f5f9", fontWeight: 600 }}>{district}</td>
                    <td style={{ textAlign: "center", color: counts.critical ? "#ef4444" : "#334155", fontWeight: 800 }}>
                      {counts.critical || "—"}
                    </td>
                    <td style={{ textAlign: "center", color: counts.moderate ? "#f97316" : "#334155", fontWeight: 800 }}>
                      {counts.moderate || "—"}
                    </td>
                    <td style={{ textAlign: "center", color: counts.low ? "#eab308" : "#334155", fontWeight: 800 }}>
                      {counts.low || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Hazard list ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>Loading...</div>
        ) : hazards.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>No Active Hazards</div>
            <div style={{ fontSize: 12, marginTop: 4, color: "#334155" }}>All roads clear — system monitoring live</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {hazards.map(h => (
              <HazardCard
                key={h.id}
                hazard={h}
                onReport={() => handleReport(h.id)}
                onResolve={() => handleResolve(h.id)}
              />
            ))}
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 10, color: "#0f2040", marginTop: 28, paddingTop: 18, borderTop: "1px solid rgba(0,212,255,0.08)" }}>
          RoadSense · Multi-sensor fusion (accelerometer + microphone + camera) · Real-time crowd-sourced from drivers across Germany
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`}</style>
    </div>
  );
}

function HazardCard({ hazard: h, onReport, onResolve }) {
  const color    = SEV_COLOR(h.severity);
  const label    = SEV_LABEL(h.severity);
  const recSpeed = h.severity >= 7 ? 10 : h.severity >= 4 ? 20 : 30;
  const [resolving, setResolving] = useState(false);

  const handleResolve = async () => { setResolving(true); await onResolve(); };

  return (
    <div style={{
      background: "rgba(6,18,40,0.85)", backdropFilter: "blur(20px)",
      border: `1px solid ${h.severity >= 7 ? "rgba(239,68,68,0.25)" : "rgba(0,212,255,0.08)"}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 14, padding: "18px 20px",
      display: "flex", alignItems: "center", gap: 18,
      opacity: resolving ? 0.4 : 1,
      transition: "opacity 0.3s, box-shadow 0.2s",
      boxShadow: `0 4px 24px rgba(0,0,0,0.25), 0 0 20px ${color}08`,
    }}>

      {/* Severity badge */}
      <div style={{ textAlign: "center", minWidth: 68 }}>
        <div style={{ fontSize: 10, color: "#1e3a5f", fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>SEV</div>
        <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1, textShadow: `0 0 16px ${color}60` }}>
          {h.severity.toFixed(1)}
        </div>
        <div style={{ fontSize: 9, fontWeight: 900, color, marginTop: 4, letterSpacing: 1,
          background: `${color}15`, padding: "2px 6px", borderRadius: 4, border: `1px solid ${color}25`,
        }}>{label}</div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4, color: "#f1f5f9" }}>
          🕳️ {h.road_name || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
        </div>
        <div style={{ fontSize: 11, color: "#334155", marginBottom: 8 }}>
          {h.district || "Germany"} · {h.report_count} report{h.report_count > 1 ? "s" : ""} · {Math.round(h.confidence * 100)}% confidence
          {h.reported_at && ` · ${new Date(h.reported_at).toLocaleTimeString()}`}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tag label={`Slow to ${recSpeed} km/h`} color="#10b981" />
          <Tag label={`${h.lat.toFixed(5)}, ${h.lng.toFixed(5)}`} color="#334155" mono />
          {h.government_reported && <Tag label="✓ Sent to BASt" color="#3b82f6" />}
          {h.escalated && <Tag label="⏰ Escalated" color="#ef4444" />}
          {h.typhoon_damage && <Tag label="🌀 Typhoon Damage" color="#f59e0b" />}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 144 }}>
        {!h.government_reported ? (
          <button onClick={onReport} style={{
            background: "rgba(59,130,246,0.12)", color: "#60a5fa",
            border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8,
            padding: "9px 14px", fontSize: 12, fontWeight: 800,
            cursor: "pointer", whiteSpace: "nowrap",
            boxShadow: "0 0 12px rgba(59,130,246,0.1)",
          }}>📨 Send to BASt</button>
        ) : (
          <div style={{
            background: "rgba(59,130,246,0.08)", color: "#3b82f6",
            border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8,
            padding: "9px 14px", fontSize: 12, fontWeight: 800, textAlign: "center",
          }}>✓ Reported</div>
        )}
        <button onClick={handleResolve} disabled={resolving} style={{
          background: "rgba(16,185,129,0.1)", color: "#10b981",
          border: "1px solid rgba(16,185,129,0.25)", borderRadius: 8,
          padding: "9px 14px", fontSize: 12, fontWeight: 800,
          cursor: resolving ? "default" : "pointer", whiteSpace: "nowrap",
          boxShadow: "0 0 12px rgba(16,185,129,0.08)",
        }}>
          {resolving ? "Removing..." : "✅ Resolved"}
        </button>
      </div>
    </div>
  );
}

function Tag({ label, color, mono }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 6,
      background: color + "15", color,
      border: `1px solid ${color}30`,
      fontFamily: mono ? "monospace" : "inherit",
      letterSpacing: mono ? 0 : 0.3,
    }}>
      {label}
    </span>
  );
}


function StatCard({ icon, label, value, color }) {
  return (
    <div style={{
      background: "rgba(6,18,40,0.8)", backdropFilter: "blur(20px)",
      border: `1px solid ${color}20`, borderRadius: 14,
      padding: "18px 16px", textAlign: "center",
      boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 20px ${color}10`,
      transition: "transform 0.2s",
    }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color, textShadow: `0 0 20px ${color}60` }}>{value}</div>
      <div style={{ fontSize: 10, color: "#334155", fontWeight: 800, marginTop: 4, letterSpacing: 1 }}>{label.toUpperCase()}</div>
    </div>
  );
}

function exportCSV(hazards) {
  const headers = "District,Road,Latitude,Longitude,Severity,Reports,Confidence,Reported At,Status";
  const rows = hazards.map(h =>
    `${h.district || ""},${(h.road_name || "").replace(/,/g, " ")},${h.lat},${h.lng},${h.severity},${h.report_count},${Math.round(h.confidence * 100)}%,${h.reported_at ? new Date(h.reported_at).toLocaleString() : ""},${h.government_reported ? "Sent to BASt" : "Pending"}`
  );
  const csv  = [headers, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `roadsense-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
