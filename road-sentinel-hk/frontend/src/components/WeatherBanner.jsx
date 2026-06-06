import React, { useState } from "react";

const CONDITION_COLORS = {
  "CRITICAL": "#ef4444",
  "SEVERE":   "#f97316",
  "POOR":     "#eab308",
  "WET":      "#3b82f6",
  "NORMAL":   "#22c55e",
};

export default function WeatherBanner({ weather }) {
  const [expanded, setExpanded] = useState(false);

  if (!weather) return (
    <div style={styles.bar}>
      <span style={{ color: "#94a3b8", fontSize: 12 }}>
        ⏳ Connecting to HKO live feed…
      </span>
    </div>
  );

  const conditionKey = Object.keys(CONDITION_COLORS).find(k =>
    weather.road_condition?.startsWith(k)
  ) || "NORMAL";
  const color = CONDITION_COLORS[conditionKey];

  return (
    <div style={{ ...styles.bar, borderLeft: `3px solid ${color}` }}>
      {/* ── Main row ── */}
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>

        <Stat label="TEMP" value={`${weather.temperature}°C`} />

        {weather.temp_min != null && weather.temp_max != null && (
          <Stat label="TODAY" value={`${weather.temp_min}–${weather.temp_max}°C`}
                color="#94a3b8" />
        )}

        <Stat label="HUMIDITY" value={`${weather.humidity}%`} />

        <Stat label="RAINFALL (1H)"
              value={`${weather.rainfall_mm} mm`}
              color={weather.rainfall_mm > 20 ? "#3b82f6" :
                     weather.rainfall_mm > 5  ? "#60a5fa" : undefined} />

        <Stat label="WIND"
              value={`${weather.wind_direction} ${weather.wind_speed_range || weather.wind_speed_kmh} km/h (F${weather.wind_force_range || weather.wind_force})`}
              color={weather.wind_force >= 7 ? "#ef4444" :
                     weather.wind_force >= 5 ? "#f97316" : undefined} />

        <Stat label="ROAD CONDITION"
              value={weather.road_condition?.split(" - ")[0].trim()}
              color={color} />

        <Stat label="HAZARD ×"
              value={`×${weather.road_multiplier}`}
              color={weather.road_multiplier > 1.5 ? "#ef4444" :
                     weather.road_multiplier > 1.2 ? "#eab308" : "#22c55e"} />

        {weather.warnings?.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {weather.warnings.map(w => (
              <span key={w} style={{
                background: "#ef444420", color: "#ef4444",
                padding: "2px 8px", borderRadius: 999,
                fontSize: 11, fontWeight: 700,
              }}>⚠ {w}</span>
            ))}
          </div>
        )}

        {weather.tc_info && (
          <span style={{
            background: "#f9731620", color: "#f97316",
            padding: "2px 8px", borderRadius: 999,
            fontSize: 11, fontWeight: 700, maxWidth: 260,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>🌀 {weather.tc_info}</span>
        )}

        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {weather.condition && (
            <button onClick={() => setExpanded(e => !e)} style={{
              background: "none", border: "1px solid #334155",
              color: "#94a3b8", padding: "2px 8px", borderRadius: 6,
              fontSize: 11, cursor: "pointer",
            }}>
              {expanded ? "▲ Hide" : "▼ Forecast"}
            </button>
          )}
          <span style={{ fontSize: 11, color: "#475569" }}>
            HKO Live
            {weather.hko_update_time
              ? ` · Updated ${weather.hko_update_time}`
              : ` · ${new Date(weather.timestamp).toLocaleTimeString("en-HK", {
                  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hong_Kong",
                })} HKT`}
          </span>
        </span>
      </div>

      {/* ── Expanded forecast row ── */}
      {expanded && weather.condition && (
        <div style={{
          marginTop: 8,
          padding: "8px 12px",
          background: "#0f172a",
          borderRadius: 8,
          fontSize: 12,
          color: "#cbd5e1",
          lineHeight: 1.6,
          borderLeft: `2px solid ${color}`,
        }}>
          <span style={{ color: "#94a3b8", fontWeight: 700, fontSize: 10 }}>
            HKO FORECAST &nbsp;
          </span>
          {weather.condition}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color || "#f1f5f9",
                     whiteSpace: "nowrap" }}>
        {value}
      </span>
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
