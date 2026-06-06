import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

// Mapbox public access token should be provided via Vite environment variables.
// Create a .env file with VITE_MAPBOX_TOKEN=pk.your_public_token and do not commit it.
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "YOUR_MAPBOX_PUBLIC_TOKEN";

const TYPE_COLORS = { pothole: "#ef4444" };
const TYPE_ICONS  = { pothole: "🕳️" };


export default function Map({ hazards, userLocation, onHazardClick }) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const markersRef    = useRef({});
  const userMarkerRef = useRef(null);
  const [is3D,        setIs3D]    = useState(true);
  const [mapLoaded,   setMapLoaded] = useState(false);

  // Initialise map
  useEffect(() => {
    const map = new mapboxgl.Map({
      container:  containerRef.current,
      style:      "mapbox://styles/mapbox/dark-v11",
      center:     [10.4515, 51.1657],
      zoom:       6,
      pitch:      45,
      bearing:    -10,
      antialias:  true,
    });


    map.addControl(new mapboxgl.NavigationControl(), "top-left");
    map.addControl(new mapboxgl.ScaleControl(),      "bottom-left");

    map.on("load", () => {
      // ── 3D Buildings Layer ───────────────────────────────────────────────
      map.addLayer({
        id:     "3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type:   "fill-extrusion",
        minzoom: 12,
        paint: {
          "fill-extrusion-color": [
            "interpolate", ["linear"], ["get", "height"],
            0,   "#1e293b",
            50,  "#334155",
            200, "#475569",
          ],
          "fill-extrusion-height":     ["get", "height"],
          "fill-extrusion-base":       ["get", "min_height"],
          "fill-extrusion-opacity":    0.85,
        },
      });

      // ── Road Hazard Heatmap Layer ────────────────────────────────────────
      map.addSource("hazard-heat", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id:     "hazard-heatmap",
        type:   "heatmap",
        source: "hazard-heat",
        maxzoom: 14,
        paint: {
          "heatmap-weight":     ["interpolate", ["linear"], ["get", "severity"], 0, 0, 10, 1],
          "heatmap-intensity":  ["interpolate", ["linear"], ["zoom"], 0, 1, 14, 3],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0,    "rgba(0,0,0,0)",
            0.2,  "#eab308",
            0.5,  "#f97316",
            0.8,  "#ef4444",
            1,    "#ffffff",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 14, 25],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 14, 0],
        },
      });

      setMapLoaded(true);
    });

    mapRef.current = map;
    return () => map.remove();
  }, []);

  // Update heatmap + markers when hazards change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Update heatmap source
    const features = hazards.map((h) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [h.lng, h.lat] },
      properties: { severity: h.severity },
    }));

    const source = map.getSource("hazard-heat");
    if (source) {
      source.setData({ type: "FeatureCollection", features });
    }

    // Remove stale markers
    const currentIds = new Set(hazards.map((h) => h.id));
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Add new markers
    hazards.forEach((hazard) => {
      if (markersRef.current[hazard.id]) return;

      const color = TYPE_COLORS[hazard.event_type] || "#ef4444";
      const size  = 14 + hazard.severity * 2;

      const icon = TYPE_ICONS[hazard.event_type] || "⚠️";
      const el = document.createElement("div");
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${color};
        border: 2.5px solid white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${Math.max(11, Math.round(size * 0.52))}px;
        line-height: 1;
        box-shadow:
          0 0 0 ${hazard.severity >= 7 ? "8px" : "4px"} ${color}40,
          0 0 20px ${color}30,
          0 4px 12px rgba(0,0,0,0.5);
        ${hazard.severity >= 7 ? "animation: pulse 1.5s infinite;" : ""}
        transition: transform 0.15s;
        user-select: none;
      `;
      el.textContent = icon;
      el.title = `${hazard.event_type.replace("_", " ")} — severity ${hazard.severity.toFixed(1)}`;

      const speed = hazard.severity >= 7 ? 10 : hazard.severity >= 4 ? 20 : 30;
      const popup = new mapboxgl.Popup({
        offset: 20,
        closeButton: false,
        maxWidth: "260px",
      }).setHTML(`
        <div style="font-family:-apple-system,sans-serif;color:#f1f5f9;background:#1e293b;border-radius:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <span style="font-size:22px;">${TYPE_ICONS[hazard.event_type] || "⚠️"}</span>
            <div>
              <div style="font-weight:800;font-size:14px;text-transform:capitalize;color:#f1f5f9;">
                ${hazard.event_type.replace("_", " ")}
              </div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
                ${hazard.road_name || (hazard.lat.toFixed(4) + ", " + hazard.lng.toFixed(4))}
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
            <div style="background:#0f172a;border-radius:6px;padding:6px;text-align:center;">
              <div style="font-size:9px;color:#64748b;font-weight:700;">SEVERITY</div>
              <div style="font-size:18px;font-weight:800;color:${color};">${hazard.severity.toFixed(1)}</div>
            </div>
            <div style="background:#0f172a;border-radius:6px;padding:6px;text-align:center;">
              <div style="font-size:9px;color:#64748b;font-weight:700;">REPORTS</div>
              <div style="font-size:18px;font-weight:800;color:#f1f5f9;">${hazard.report_count}</div>
            </div>
            <div style="background:#0f172a;border-radius:6px;padding:6px;text-align:center;">
              <div style="font-size:9px;color:#64748b;font-weight:700;">CONF.</div>
              <div style="font-size:18px;font-weight:800;color:#f1f5f9;">${Math.round(hazard.confidence * 100)}%</div>
            </div>
          </div>
          <div style="background:#0f172a;border-radius:6px;padding:8px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:11px;color:#94a3b8;">Slow down to</span>
            <span style="font-size:20px;font-weight:900;color:#22c55e;">${speed} km/h</span>
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([hazard.lng, hazard.lat])
        .addTo(map);

      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.2)";
        popup.setLngLat([hazard.lng, hazard.lat]).addTo(map);
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
        popup.remove();
      });
      el.addEventListener("click", () => onHazardClick?.(hazard));

      markersRef.current[hazard.id] = marker;
    });
  }, [hazards, mapLoaded]);

  // User location — animated blue dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 18px; height: 18px;
        border-radius: 50%;
        background: #00d9ff;
        border: 3px solid white;
        box-shadow: 0 0 0 8px #00d9ff30, 0 0 24px rgba(0, 217, 255, 0.4), 0 4px 12px rgba(0,0,0,0.4);
        animation: pulse 2s infinite;
      `;
      userMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }

    map.flyTo({
      center:  [userLocation.lng, userLocation.lat],
      zoom:    14,
      pitch:   50,
      bearing: -15,
      speed:   0.8,
    });
  }, [userLocation]);

  // Toggle 3D / 2D
  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;

    if (is3D) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    } else {
      map.easeTo({ pitch: 55, bearing: -15, duration: 600 });
    }
    setIs3D(!is3D);
  };

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 3D toggle button */}
      <button
        onClick={toggle3D}
        style={{
          position:   "absolute",
          top:        12,
          right:      12,
          background: is3D ? "#00d9ff" : "#131b2e",
          color:      is3D ? "#0a0f1f" : "#f1f5f9",
          border:     is3D ? "1px solid #00d9ff" : "1px solid #1e2d47",
          borderRadius: 8,
          padding:    "6px 12px",
          fontSize:   12,
          fontWeight: 700,
          cursor:     "pointer",
          zIndex:     10,
          boxShadow:  is3D ? "0 0 24px rgba(0, 217, 255, 0.3)" : "0 4px 12px rgba(0,0,0,0.4)",
          transition: "all 0.2s",
        }}
      >
        {is3D ? "3D ON" : "2D"}
      </button>

      {/* Legend */}
      <div style={{
        position:   "absolute",
        bottom:     32,
        right:      12,
        background: "rgba(19, 27, 46, 0.95)",
        border:     "1px solid rgba(45, 212, 191, 0.2)",
        borderRadius: 12,
        padding:    "12px 16px",
        zIndex:     10,
        boxShadow:  "0 12px 40px rgba(0, 217, 255, 0.08), 0 4px 20px rgba(0,0,0,0.4)",
        backdropFilter: "blur(12px)",
      }}>
        {Object.entries(TYPE_ICONS).map(([type, icon]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "capitalize" }}>
              {type.replace("_", " ")}
            </span>
            <span style={{
              width: 8, height: 8,
              borderRadius: "50%",
              background: TYPE_COLORS[type],
              marginLeft: "auto",
              display: "inline-block",
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}
