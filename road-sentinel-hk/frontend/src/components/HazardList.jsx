import React from "react";

const TYPE_ICONS = {
  pothole:    "🕳️",
  slippery:   "🌊",
  wet_road:   "💧",
  rough_road: "⚡",
  bump:       "🔺",
};

const SEVERITY_COLORS = {
  high:   "#ef4444",
  medium: "#f97316",
  low:    "#eab308",
};

export default function HazardList({ hazards, stats, onSelect }) {
  const sorted = [...hazards].sort((a, b) => b.severity - a.severity);

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>LIVE HAZARDS</span>
        <span style={{
          background: "#ef444420",
          color: "#ef4444",
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
        }}>
          {hazards.length} ACTIVE
        </span>
      </div>

      {stats && (
        <div style={styles.statsRow}>
          {Object.entries(stats.by_type || {}).map(([type, count]) => (
            <div key={type} style={styles.statChip}>
              <span>{TYPE_ICONS[type] || "⚠️"}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {type.replace("_", " ")}
              </span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      <div style={styles.list}>
        {sorted.length === 0 && (
          <div style={{ color: "#94a3b8", fontSize: 13, padding: 16, textAlign: "center" }}>
            No confirmed hazards. Drive to detect.
          </div>
        )}
        {sorted.map((h) => (
          <HazardCard key={h.id} hazard={h} onClick={() => onSelect?.(h)} />
        ))}
      </div>
    </div>
  );
}

function HazardCard({ hazard, onClick }) {
  const level  = severityLevel(hazard.severity);
  const color  = SEVERITY_COLORS[level];
  const age    = timeAgo(hazard.last_reported);

  return (
    <div onClick={onClick} style={{ ...styles.card, borderLeft: `3px solid ${color}`, cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>{TYPE_ICONS[hazard.event_type] || "⚠️"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>
              {hazard.event_type.replace("_", " ")}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {hazard.lat.toFixed(4)}, {hazard.lng.toFixed(4)}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color }}>{hazard.severity.toFixed(1)}</div>
          <div style={{ fontSize: 10, color: "#64748b" }}>/ 10</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Tag color={color}>{level.toUpperCase()}</Tag>
        <Tag color="#94a3b8">{hazard.report_count} reports</Tag>
        <Tag color="#94a3b8">{Math.round(hazard.confidence * 100)}% confident</Tag>
        {hazard.weather_multiplier > 1.2 && <Tag color="#3b82f6">Rain boost ×{hazard.weather_multiplier}</Tag>}
        <Tag color="#64748b">{age}</Tag>
      </div>
    </div>
  );
}

function Tag({ color, children }) {
  return (
    <span style={{
      padding: "2px 6px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      background: color + "20",
      color,
    }}>
      {children}
    </span>
  );
}

function severityLevel(s) {
  if (s >= 7) return "high";
  if (s >= 4) return "medium";
  return "low";
}

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const styles = {
  panel: {
    width: 300,
    minWidth: 300,
    background: "#1e293b",
    borderLeft: "1px solid #334155",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
    flex: 1,
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #334155",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid #334155",
  },
  statChip: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "#0f172a",
    padding: "4px 8px",
    borderRadius: 6,
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  card: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: 10,
    transition: "border-color 0.15s",
  },
};
