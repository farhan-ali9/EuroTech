import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

// Mapbox public access token should be provided via Vite environment variables.
// Create a .env file with VITE_MAPBOX_TOKEN=pk.your_public_token and do not commit it.
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "YOUR_MAPBOX_PUBLIC_TOKEN";

const TYPE_COLORS = {
  pothole:    "#ef4444",
  slippery:   "#f97316",
  wet_road:   "#3b82f6",
  rough_road: "#eab308",
  bump:       "#8b5cf6",
};

const TYPE_ICONS = {
  pothole:    "🕳️",
  slippery:   "🌊",
  wet_road:   "💧",
  rough_road: "⚡",
  bump:       "🔺",
};

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
      container:   containerRef.current,
      style:       "mapbox://styles/mapbox/dark-v11",
      center:      [114.1095, 22.3600],   // full HK territory centre
      zoom:        10,                    // zoomed out to show all districts
      pitch:       45,
      bearing:     -10,
      antialias:   true,
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
        font-size: ${size * 0.45}px;
        box-shadow:
          0 0 0 ${hazard.severity >= 7 ? "8px" : "4px"} ${color}40,
          0 4px 12px rgba(0,0,0,0.5);
        ${hazard.severity >= 7 ? "animation: pulse 1.5s infinite;" : ""}
        transition: transform 0.15s;
      `;
      el.title = hazard.event_type;

      // Popup with full details
      const popup = new mapboxgl.Popup({
        offset: 20,
        closeButton: false,
        maxWidth: "240px",
      }).setHTML(`
        <div style="font-family:-apple-system,sans-serif">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="font-size:22px">${TYPE_ICONS[hazard.event_type] || "⚠️"}</span>
            <div>
              <div style="font-weight:800;font-size:14px;text-transform:capitalize">
                ${hazard.event_type.replace("_", " ")}
              </div>
              <div style="font-size:11px;color:#f1f5f9;margin-top:2px;font-weight:600">
                ${hazard.road_name || ""}
              </div>
              <div style="font-size:10px;color:#94a3b8">
                ${hazard.full_address ? hazard.full_address.split(",").slice(1).join(",").trim() : new Date(hazard.last_reported).toLocaleTimeString()}
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
            <div style="background:#0f172a;border-radius:6px;padding:6px;text-align:center">
              <div style="font-size:9px;color:#64748b;font-weight:700">SEVERITY</div>
              <div style="font-size:18px;font-weight:800;color:${color}">${hazard.severity.toFixed(1)}</div>
            </div>
            <div style="background:#0f172a;border-radius:6px;padding:6px;text-align:center">
              <div style="font-size:9px;color:#64748b;font-weight:700">REPORTS</div>
              <div style="font-size:18px;font-weight:800">${hazard.report_count}</div>
            </div>
            <div style="background:#0f172a;border-radius:6px;padding:6px;text-align:center">
              <div style="font-size:9px;color:#64748b;font-weight:700">CONF.</div>
              <div style="font-size:18px;font-weight:800">${Math.round(hazard.confidence * 100)}%</div>
            </div>
          </div>

          ${hazard.weather_multiplier > 1.2 ? `
            <div style="background:#3b82f615;border:1px solid #3b82f640;color:#3b82f6;
                        padding:5px 8px;border-radius:5px;font-size:11px;font-weight:700;margin-bottom:8px">
              ⛈ Rain severity boost ×${hazard.weather_multiplier}
            </div>` : ""}

          <div style="background:#ef444415;border:1px solid #ef444430;
                      border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:10px;color:#94a3b8">Recommended speed</div>
            <div style="font-size:22px;font-weight:900;color:#22c55e">
              ${hazard.severity >= 7 ? 10 : hazard.severity >= 4 ? 20 : 30} km/h
            </div>
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([hazard.lng, hazard.lat])
        .addTo(map);

      let leaveTimer = null;

      el.addEventListener("mouseenter", () => {
        clearTimeout(leaveTimer);
        el.style.transform = "scale(1.2)";
        popup.setLngLat([hazard.lng, hazard.lat]).addTo(map);
      });
      el.addEventListener("mouseleave", () => {
        leaveTimer = setTimeout(() => {
          el.style.transform = "scale(1)";
          popup.remove();
        }, 200);
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
        background: #3b82f6;
        border: 3px solid white;
        box-shadow: 0 0 0 8px #3b82f630, 0 4px 12px rgba(0,0,0,0.4);
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
          background: is3D ? "#3b82f6" : "#1e293b",
          color:      "white",
          border:     "1px solid #334155",
          borderRadius: 8,
          padding:    "6px 12px",
          fontSize:   12,
          fontWeight: 700,
          cursor:     "pointer",
          zIndex:     10,
          boxShadow:  "0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        {is3D ? "3D ON" : "2D"}
      </button>

      {/* Legend */}
      <div style={{
        position:   "absolute",
        bottom:     32,
        right:      12,
        background: "#1e293b",
        border:     "1px solid #334155",
        borderRadius: 10,
        padding:    "10px 14px",
        zIndex:     10,
        boxShadow:  "0 4px 20px rgba(0,0,0,0.5)",
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
