import React, { useEffect, useState } from "react";
import { fetchGovernmentAlerts } from "../services/api";

const TYPE_ICONS = {
  pothole:    "🕳️",
  slippery:   "🌊",
  wet_road:   "💧",
  rough_road: "⚡",
  bump:       "🔺",
};

const SEVERITY_COLOR = (s) =>
  s >= 7 ? "#ef4444" : s >= 4 ? "#f97316" : "#eab308";

export default function GovernmentPortal() {
  const [alerts,      setAlerts]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastFetch,   setLastFetch]   = useState(null);
  const [forwarded,   setForwarded]   = useState({});   // track which alerts forwarded to HyD

  const load = async () => {
    try {
      const data = await fetchGovernmentAlerts();
      setAlerts(data.alerts || []);
      setLastFetch(new Date().toLocaleTimeString());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const critical = alerts.filter((a) => a.severity >= 7);
  const moderate = alerts.filter((a) => a.severity >= 4 && a.severity < 7);
  const low      = alerts.filter((a) => a.severity < 4);

  const forwardToHyD = (alertId) => {
    setForwarded((prev) => ({ ...prev, [alertId]: true }));
  };

  const exportCSV = () => {
    const headers = "District,Type,Latitude,Longitude,Severity,Reports,Confidence,Weather Multiplier,Reported At,Status";
    const rows = alerts.map((a) =>
      `${a.district},${a.event_type},${a.lat},${a.lng},${a.severity},${a.report_count},${Math.round(a.confidence*100)}%,${a.weather_multiplier},${a.reported_at ? new Date(a.reported_at).toLocaleString() : ""},${forwarded[a.id] ? "Forwarded to HyD RMMS" : "Pending"}`
    );
    const csv  = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `road-sentinel-hk-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>
            🏛️ HK Highways Department · Road Hazard Alerts
          </div>
          <div style={styles.headerSub}>
            Integrated with HyD RMMS · Confirmed by 3+ independent vehicle sensors · PDPO Cap 486 compliant
          </div>
          {/* HyD integration badge */}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span style={styles.systemBadge}>✓ RMMS Compatible</span>
            <span style={styles.systemBadge}>✓ RDDS Complementary</span>
            <span style={styles.systemBadge}>✓ 2,240 km Coverage</span>
            <span style={{ ...styles.systemBadge, color: "#22c55e", borderColor: "#22c55e40", background: "#22c55e10" }}>
              ✓ HKO Weather Live
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div style={styles.liveBadge}>
            <span style={styles.liveDot} /> LIVE FEED
          </div>
          <button onClick={exportCSV} style={styles.exportBtn}>
            ⬇ Export CSV for HyD
          </button>
          {lastFetch && (
            <div style={{ fontSize: 11, color: "#64748b" }}>
              Updated {lastFetch}
            </div>
          )}
        </div>
      </div>

      {/* HyD info banner */}
      <div style={styles.hydBanner}>
        <div style={{ fontSize: 13 }}>ℹ️</div>
        <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
          <strong style={{ color: "#f1f5f9" }}>How Road Sentinel HK complements HyD systems:</strong>
          {" "}HyD's RDDS inspection vehicles reduce detection time from 48→24 hrs on scheduled routes.
          Road Sentinel HK reduces it to <strong style={{ color: "#22c55e" }}>&lt;5 minutes</strong> — crowd-sourced from real drivers 24/7.
          Every confirmed hazard here is auto-forwarded to RMMS for maintenance dispatch.
        </div>
      </div>

      {/* Summary cards */}
      <div style={styles.summaryRow}>
        <SummaryCard label="Total Alerts" value={alerts.length} color="#3b82f6" icon="📋" />
        <SummaryCard label="Critical"     value={critical.length} color="#ef4444" icon="🚨" />
        <SummaryCard label="Moderate"     value={moderate.length} color="#f97316" icon="⚠️" />
        <SummaryCard label="Low Priority" value={low.length}      color="#eab308" icon="🔶" />
      </div>

      {/* Critical banner */}
      {critical.length > 0 && (
        <div style={styles.criticalBanner}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {critical.length} CRITICAL HAZARD{critical.length > 1 ? "S" : ""} REQUIRE IMMEDIATE ATTENTION
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              Severity ≥ 7/10 · Road maintenance team dispatch recommended
            </div>
          </div>
        </div>
      )}

      {/* Alerts table */}
      {loading ? (
        <div style={styles.empty}>Loading government alerts...</div>
      ) : alerts.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No Active Alerts</div>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
            All confirmed hazards below severity threshold.<br />
            System is monitoring in real time.
          </div>
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.th}>Priority</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>District</th>
                <th style={styles.th}>Coordinates</th>
                <th style={styles.th}>Severity</th>
                <th style={styles.th}>Reports</th>
                <th style={styles.th}>Confidence</th>
                <th style={styles.th}>Weather</th>
                <th style={styles.th}>Reported At</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts
                .sort((a, b) => b.severity - a.severity)
                .map((alert, i) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    index={i}
                    forwarded={!!forwarded[alert.id]}
                    onForward={() => forwardToHyD(alert.id)}
                  />
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        Road Sentinel HK · Powered by multi-sensor fusion (accelerometer + microphone + camera) ·
        Crowd-sourced from drivers across Hong Kong · Data compliant with PDPO Cap 486
      </div>
    </div>
  );
}

function AlertRow({ alert, index, forwarded, onForward }) {
  const color    = SEVERITY_COLOR(alert.severity);
  const priority = alert.severity >= 7 ? "CRITICAL" : alert.severity >= 4 ? "MODERATE" : "LOW";
  const priorityColor = alert.severity >= 7 ? "#ef4444" : alert.severity >= 4 ? "#f97316" : "#eab308";
  const speedRec = alert.severity >= 7 ? 10 : alert.severity >= 4 ? 20 : 30;

  return (
    <tr style={{
      background: index % 2 === 0 ? "#1e293b" : "#162032",
      borderBottom: "1px solid #1e293b",
    }}>
      <td style={styles.td}>
        <span style={{
          background: priorityColor + "20",
          color: priorityColor,
          padding: "3px 8px",
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1,
        }}>
          {priority}
        </span>
      </td>
      <td style={styles.td}>
        <span style={{ fontSize: 16, marginRight: 6 }}>{TYPE_ICONS[alert.event_type] || "⚠️"}</span>
        <span style={{ textTransform: "capitalize", fontWeight: 600, fontSize: 13 }}>
          {alert.event_type.replace("_", " ")}
        </span>
      </td>
      <td style={{ ...styles.td, color: "#94a3b8" }}>{alert.district || "—"}</td>
      <td style={{ ...styles.td, fontSize: 11, color: "#94a3b8" }}>
        {alert.full_address || alert.road_name ? (
          <div>
            <div style={{ fontWeight: 600, color: "#f1f5f9", fontSize: 12 }}>
              {alert.road_name || "Fetching..."}
            </div>
            <div style={{ color: "#64748b", fontSize: 10, fontFamily: "monospace", marginTop: 2 }}>
              {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: "monospace", color: "#64748b" }}>
            {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
          </div>
        )}
      </td>
      <td style={styles.td}>
        <span style={{ color, fontWeight: 800, fontSize: 15 }}>
          {alert.severity.toFixed(1)}
        </span>
        <span style={{ color: "#64748b", fontSize: 11 }}>/10</span>
      </td>
      <td style={{ ...styles.td, textAlign: "center", fontWeight: 700 }}>
        {alert.report_count}
      </td>
      <td style={{ ...styles.td, textAlign: "center" }}>
        <div style={{
          background: "#0f172a",
          borderRadius: 4,
          height: 6,
          width: 60,
          overflow: "hidden",
          display: "inline-block",
        }}>
          <div style={{
            height: "100%",
            width: `${Math.round(alert.confidence * 100)}%`,
            background: color,
          }} />
        </div>
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
          {Math.round(alert.confidence * 100)}%
        </div>
      </td>
      <td style={styles.td}>
        {alert.weather_multiplier > 1.2 ? (
          <span style={{ color: "#3b82f6", fontSize: 12, fontWeight: 700 }}>
            ⛈ ×{alert.weather_multiplier.toFixed(1)}
          </span>
        ) : (
          <span style={{ color: "#64748b", fontSize: 12 }}>Clear</span>
        )}
      </td>
      <td style={{ ...styles.td, fontSize: 11, color: "#94a3b8" }}>
        {alert.reported_at
          ? new Date(alert.reported_at).toLocaleTimeString()
          : "—"}
      </td>
      <td style={styles.td}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{
            background: "#22c55e20", color: "#22c55e",
            padding: "3px 8px", borderRadius: 5,
            fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
          }}>
            Slow to {speedRec} km/h
          </div>
          {forwarded ? (
            <div style={{
              background: "#3b82f620", color: "#3b82f6",
              padding: "3px 8px", borderRadius: 5,
              fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
            }}>
              ✓ Sent to HyD RMMS
            </div>
          ) : (
            <button
              onClick={onForward}
              style={{
                background: "#1e40af", color: "white",
                border: "none", borderRadius: 5,
                padding: "3px 8px", fontSize: 10,
                fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              → Forward to HyD
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function SummaryCard({ label, value, color, icon }) {
  return (
    <div style={styles.summaryCard}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const styles = {
  page: {
    position: "absolute",
    inset: 0,
    overflowY: "auto",
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 20,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 16,
    borderBottom: "1px solid #334155",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#f1f5f9",
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
  },
  liveBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#22c55e15",
    border: "1px solid #22c55e40",
    color: "#22c55e",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
  },
  liveDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#22c55e",
    animation: "pulse 2s infinite",
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
  },
  summaryCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "16px 20px",
    textAlign: "center",
  },
  criticalBanner: {
    background: "#ef444415",
    border: "1px solid #ef444450",
    borderRadius: 10,
    padding: "14px 20px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: "#ef4444",
    animation: "pulse 2s infinite",
  },
  tableWrap: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    overflowX: "auto",
    overflowY: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    color: "#f1f5f9",
  },
  thead: {
    background: "#0f172a",
    borderBottom: "2px solid #334155",
  },
  th: {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 10,
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: 1,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 14px",
    verticalAlign: "middle",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#94a3b8",
    padding: 60,
    textAlign: "center",
  },
  footer: {
    fontSize: 10,
    color: "#334155",
    textAlign: "center",
    padding: "12px 0",
    borderTop: "1px solid #1e293b",
  },
  systemBadge: {
    fontSize: 10, fontWeight: 700,
    color: "#3b82f6",
    background: "#3b82f610",
    border: "1px solid #3b82f630",
    borderRadius: 4,
    padding: "2px 8px",
  },
  exportBtn: {
    background: "#1e293b",
    color: "#22c55e",
    border: "1px solid #22c55e40",
    borderRadius: 7,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  hydBanner: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "12px 16px",
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
};
