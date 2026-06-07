import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import Map, { SEVERITY_COLORS, SEVERITY_LABELS } from "../components/Map";
import { Mark } from "../components/Logo";
import { fetchHazards, sendReport, deleteHazard } from "../services/api";

const POLL_MS = 10000;

// Map regions. bounds = [[west, south], [east, north]]
const REGIONS = {
  hk: { label: "Hong Kong", bounds: [[113.8, 22.15], [114.4, 22.55]] },
  munich: { label: "Munich", bounds: [[11.4, 48.06], [11.72, 48.31]] },
};

const inBounds = (h, [[w, s], [e, n]]) =>
  h.lng >= w && h.lng <= e && h.lat >= s && h.lat <= n;

export default function GovMap() {
  const [hazards, setHazards] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [region, setRegion] = useState("hk");

  const refresh = useCallback(async () => {
    try {
      const data = await fetchHazards();
      setHazards(data.hazards || []);
      setUpdated(new Date());
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Demo/debug: resolve (delete) a defect, and add one by double-clicking the map.
  const handleResolve = useCallback(
    async (id) => {
      setHazards((prev) => prev.filter((h) => h.id !== id)); // optimistic
      try {
        await deleteHazard(id);
      } catch {}
      refresh();
    },
    [refresh]
  );

  const handleAdd = useCallback(
    async ({ lat, lng }, severity) => {
      try {
        await sendReport({ lat, lng, severity });
      } catch {}
      refresh();
    },
    [refresh]
  );

  const regionHazards = useMemo(
    () => hazards.filter((h) => inBounds(h, REGIONS[region].bounds)),
    [hazards, region]
  );

  const counts = [0, 0, 0, 0, 0, 0];
  regionHazards.forEach((h) => {
    counts[Math.max(1, Math.min(5, Math.round(h.severity)))]++;
  });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Map
        hazards={regionHazards}
        bounds={REGIONS[region].bounds}
        onResolve={handleResolve}
        onAddDefect={handleAdd}
      />

      {/* Header overlay */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.logo}>
            <Mark size={22} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <div style={styles.title}>
              BumpLess <span style={{ color: "#64748b", fontWeight: 600 }}>· Government</span>
            </div>
            <div style={styles.sub}>
              {regionHazards.length} road defect{regionHazards.length === 1 ? "" : "s"} to repair ·{" "}
              {REGIONS[region].label}
              {updated && <span style={{ color: "#475569" }}> · updated {updated.toLocaleTimeString()}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Region selector */}
          <div style={styles.segmented}>
            {Object.entries(REGIONS).map(([key, r]) => (
              <button
                key={key}
                onClick={() => setRegion(key)}
                style={{ ...styles.segBtn, ...(region === key ? styles.segBtnActive : {}) }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Severity legend with live counts */}
          <div style={styles.legend}>
            {[5, 4, 3, 2, 1].map((s) => (
              <div key={s} style={styles.legendItem} title={SEVERITY_LABELS[s]}>
                <span style={{ ...styles.dot, background: SEVERITY_COLORS[s] }} />
                <span style={styles.legendNum}>{counts[s]}</span>
              </div>
            ))}
          </div>

          <Link to="/" style={styles.driverLink}>
            Driver app →
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    padding: "12px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    background: "linear-gradient(180deg, rgba(10,15,31,0.92) 0%, rgba(10,15,31,0) 100%)",
    backdropFilter: "blur(2px)",
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "#2C5364",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
  },
  title: { fontSize: 18, fontWeight: 900, letterSpacing: 0.3 },
  sub: { fontSize: 12, color: "#94a3b8", marginTop: 1 },
  segmented: {
    display: "flex",
    gap: 3,
    background: "rgba(19,27,46,0.9)",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 10,
    padding: 3,
  },
  segBtn: {
    border: "none",
    background: "transparent",
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 14px",
    borderRadius: 7,
    cursor: "pointer",
  },
  segBtnActive: { background: "#2C5364", color: "#fff" },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(19,27,46,0.9)",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 10,
    padding: "6px 12px",
  },
  legendItem: { display: "flex", alignItems: "center", gap: 5 },
  dot: { width: 11, height: 11, borderRadius: "50%", display: "inline-block" },
  legendNum: { fontSize: 13, fontWeight: 800, color: "#e2e8f0", minWidth: 12 },
  driverLink: {
    fontSize: 12,
    fontWeight: 700,
    color: "#7fb2c4",
    textDecoration: "none",
    background: "rgba(127,178,196,0.12)",
    border: "1px solid rgba(127,178,196,0.3)",
    borderRadius: 8,
    padding: "7px 12px",
    whiteSpace: "nowrap",
  },
};
