import React, { useEffect, useState } from "react";
import { fetchGovernmentAlerts, reportHazardToGovernment, resolveHazard } from "../services/api";

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
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "#0f172a", color: "#f1f5f9" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #1e293b" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>
              🏛️ Bundesanstalt für Straßenwesen (BASt) — Road Hazard Reports
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              Real-time driver-detected potholes · Auto-confirmed by sensor fusion · Integrated with BASt road maintenance
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#22c55e15", border: "1px solid #22c55e40", padding: "4px 12px", borderRadius: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: "#22c55e" }}>LIVE</span>
            </div>
            {lastFetch && <div style={{ fontSize: 10, color: "#334155" }}>Updated {lastFetch}</div>}
            <button onClick={exportCSV.bind(null, hazards)} style={{ background: "#1e293b", color: "#64748b", border: "1px solid #334155", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>
              ⬇ Export CSV
            </button>
          </div>
        </div>

        {/* ── Summary stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          <StatCard icon="📋" label="Total Reported" value={hazards.length}   color="#3b82f6" />
          <StatCard icon="🚨" label="Critical"        value={critical.length} color="#ef4444" />
          <StatCard icon="⚠️" label="Moderate"        value={moderate.length} color="#f97316" />
          <StatCard icon="📨" label="Sent to Govt"    value={reported.length} color="#22c55e" />
        </div>


        {/* ── Critical alert banner ── */}
        {critical.length > 0 && (
          <div style={{ background: "#ef444412", border: "1px solid #ef444440", borderRadius: 10, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 24 }}>🚨</span>
            <div>
              <div style={{ fontWeight: 800, color: "#ef4444" }}>
                {critical.length} CRITICAL POTHOLE{critical.length > 1 ? "S" : ""} — IMMEDIATE REPAIR NEEDED
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                Severity ≥ 7/10 · High risk of vehicle damage and accidents
              </div>
            </div>
          </div>
        )}

        {/* ── District breakdown ── */}
        {districtRows.length > 0 && (
          <div style={{ background: "#0d1525", border: "1px solid #1e293b", borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", letterSpacing: 1, marginBottom: 12 }}>
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

        <div style={{ textAlign: "center", fontSize: 10, color: "#1e293b", marginTop: 24, paddingTop: 16, borderTop: "1px solid #1e293b" }}>
          Road Sentinel DE · Multi-sensor fusion (accelerometer + microphone + camera) · Real-time crowd-sourced from drivers across Germany
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`}</style>
    </div>
  );
}

function HazardCard({ hazard: h, onReport, onResolve }) {
  const color   = SEV_COLOR(h.severity);
  const label   = SEV_LABEL(h.severity);
  const recSpeed = h.severity >= 7 ? 10 : h.severity >= 4 ? 20 : 30;
  const [resolving, setResolving] = useState(false);

  const handleResolve = async () => {
    setResolving(true);
    await onResolve();
  };

  return (
    <div style={{
      background: "#0d1525",
      border: `1px solid ${h.severity >= 7 ? "#ef444430" : "#1e293b"}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 16,
      opacity: resolving ? 0.4 : 1,
      transition: "opacity 0.3s",
    }}>

      {/* Severity badge */}
      <div style={{ textAlign: "center", minWidth: 64 }}>
        <div style={{ fontSize: 11, color: "#334155", fontWeight: 700, marginBottom: 2 }}>SEV</div>
        <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{h.severity.toFixed(1)}</div>
        <div style={{ fontSize: 9, fontWeight: 800, color, marginTop: 2, letterSpacing: 1 }}>{label}</div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
          🕳️ Pothole — {h.road_name || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
          {h.district || "Germany"} · {h.report_count} report{h.report_count > 1 ? "s" : ""} · {Math.round(h.confidence * 100)}% confidence
          {h.reported_at && ` · Flagged ${new Date(h.reported_at).toLocaleTimeString()}`}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Tag label={`Slow to ${recSpeed} km/h`} color="#22c55e" />
          <Tag label={`${h.lat.toFixed(5)}, ${h.lng.toFixed(5)}`} color="#64748b" mono />
          {h.government_reported && <Tag label="✓ Sent to BASt" color="#3b82f6" />}
          {h.escalated && <Tag label="⏰ Escalated" color="#ef4444" />}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
        {!h.government_reported ? (
          <button
            onClick={onReport}
            style={{
              background: "#1e3a5f", color: "#60a5fa",
              border: "1px solid #1e4a8f", borderRadius: 7,
              padding: "8px 14px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            📨 Send to BASt
          </button>
        ) : (
          <div style={{ background: "#172a42", color: "#3b82f6", border: "1px solid #1e4a8f", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, textAlign: "center" }}>
            ✓ Reported to BASt
          </div>
        )}
        <button
          onClick={handleResolve}
          disabled={resolving}
          style={{
            background: "#14532d", color: "#4ade80",
            border: "1px solid #166534", borderRadius: 7,
            padding: "8px 14px", fontSize: 12, fontWeight: 700,
            cursor: resolving ? "default" : "pointer", whiteSpace: "nowrap",
          }}
        >
          {resolving ? "Removing..." : "✅ Mark Resolved"}
        </button>
      </div>
    </div>
  );
}

function Tag({ label, color, mono }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
      background: color + "18", color,
      fontFamily: mono ? "monospace" : "inherit",
    }}>
      {label}
    </span>
  );
}


function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ background: "#0d1525", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, marginTop: 2 }}>{label.toUpperCase()}</div>
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
  a.download = `road-sentinel-de-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
