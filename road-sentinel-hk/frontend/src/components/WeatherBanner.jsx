import React from "react";

const CONDITION_COLORS = {
  "CRITICAL":  "#ef4444",
  "SEVERE":    "#f97316",
  "POOR":      "#eab308",
  "WET":       "#3b82f6",
  "NORMAL":    "#22c55e",
};

export default function WeatherBanner({ weather }) {
  if (!weather) return (
    <div style={styles.bar}>
      <span style={{ color: "#94a3b8", fontSize: 12 }}>Loading weather from HKO...</span>
    </div>
  );

  const conditionKey = Object.keys(CONDITION_COLORS).find(k =>
    weather.road_condition?.startsWith(k)
  ) || "NORMAL";

  const color = CONDITION_COLORS[conditionKey];

  return (
    <div style={{ ...styles.bar, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>

        <Stat label="TEMP" value={`${weather.temperature}°C`} />
        <Stat label="HUMIDITY" value={`${weather.humidity}%`} />
        <Stat label="RAINFALL" value={`${weather.rainfall_mm}mm`} color={weather.rainfall_mm > 20 ? "#3b82f6" : undefined} />
        <Stat
          label="ROAD"
          value={weather.road_condition?.split("—")[0].trim()}
          color={color}
        />
        <Stat
          label="HAZARD MULTIPLIER"
          value={`×${weather.road_multiplier}`}
          color={weather.road_multiplier > 1.5 ? "#ef4444" : weather.road_multiplier > 1.2 ? "#eab308" : "#22c55e"}
        />

        {weather.warnings?.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            {weather.warnings.map(w => (
              <span key={w} style={{
                background: "#ef444420",
                color: "#ef4444",
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
              }}>
                ⚠ {w}
              </span>
            ))}
          </div>
        )}

        <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>
          HKO Live · {new Date(weather.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 9, color: "#64748b", fontWeight: 700, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color || "#f1f5f9" }}>{value}</span>
    </div>
  );
}

const styles = {
  bar: {
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    padding: "8px 16px",
    flexShrink: 0,
  },
};
