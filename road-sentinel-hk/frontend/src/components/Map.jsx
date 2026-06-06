import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "YOUR_MAPBOX_PUBLIC_TOKEN";

export const SEVERITY_COLORS = {
  1: "#22c55e", // minor
  2: "#84cc16", // low
  3: "#eab308", // moderate
  4: "#f97316", // high
  5: "#ef4444", // severe
};
export const SEVERITY_LABELS = {
  1: "Minor",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Severe",
};

const HK_BOUNDS = [
  [113.80, 22.15],
  [114.40, 22.55],
];

const clampSev = (s) => Math.max(1, Math.min(5, Math.round(s || 1)));
export const sevColor = (s) => SEVERITY_COLORS[clampSev(s)];

function popupHTML(h) {
  const sev = clampSev(h.severity);
  const when = h.last_reported ? new Date(h.last_reported).toLocaleString() : "";
  return `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:180px">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
        <span style="width:30px;height:30px;border-radius:50%;background:${sevColor(sev)};
          color:#0a0f1f;display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:15px">${sev}</span>
        <div>
          <div style="font-weight:800;font-size:14px;color:#0f172a">
            Severity ${sev}/5 · ${SEVERITY_LABELS[sev]}
          </div>
          <div style="font-size:12px;color:#475569">${h.road_name || "Unknown road"}</div>
        </div>
      </div>
      <div style="font-size:12px;color:#334155">Reported <b>${h.report_count}×</b></div>
      ${when ? `<div style="font-size:11px;color:#94a3b8;margin-top:3px">Last seen ${when}</div>` : ""}
      <div style="margin-top:8px;text-align:right">
        <span data-bl-resolve="${h.id}" style="font-size:10px;color:#cbd5e1;cursor:pointer;text-decoration:underline">resolve</span>
      </div>
    </div>`;
}

// Double-click picker to add a defect (demo/debug).
function addPopupHTML() {
  const btns = [1, 2, 3, 4, 5]
    .map(
      (s) =>
        `<button data-bl-add="${s}" style="width:30px;height:30px;border:none;border-radius:6px;
          background:${SEVERITY_COLORS[s]};color:#0a0f1f;font-weight:800;cursor:pointer">${s}</button>`
    )
    .join("");
  return `
    <div style="font-family:-apple-system,system-ui,sans-serif;text-align:center">
      <div style="font-size:11px;color:#475569;font-weight:700;margin-bottom:6px">Add defect — severity</div>
      <div style="display:flex;gap:5px">${btns}</div>
    </div>`;
}

export default function Map({ hazards = [], bounds = HK_BOUNDS, onResolve, onAddDefect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const addPopupRef = useRef(null);
  const hoverTimer = useRef(null);
  const onResolveRef = useRef(onResolve);
  const onAddRef = useRef(onAddDefect);
  const [loaded, setLoaded] = useState(false);

  // Keep latest callbacks available to the once-registered listeners.
  useEffect(() => {
    onResolveRef.current = onResolve;
    onAddRef.current = onAddDefect;
  }, [onResolve, onAddDefect]);

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      bounds: bounds,
      fitBoundsOptions: { padding: 60 },
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.doubleClickZoom.disable(); // double-click is used to add a defect (demo)
    map.on("load", () => setLoaded(true));

    // Double-click → severity picker to add a defect.
    map.on("dblclick", (e) => {
      if (!addPopupRef.current) {
        addPopupRef.current = new mapboxgl.Popup({ offset: 12, closeButton: true });
      }
      addPopupRef.current.setLngLat(e.lngLat).setHTML(addPopupHTML()).addTo(map);
    });

    // One delegated click handler for the in-popup resolve / add buttons.
    const onClick = (e) => {
      const res = e.target.closest && e.target.closest("[data-bl-resolve]");
      if (res) {
        onResolveRef.current?.(res.getAttribute("data-bl-resolve"));
        markersRef.current.forEach((m) => m.getPopup()?.remove());
        return;
      }
      const add = e.target.closest && e.target.closest("[data-bl-add]");
      if (add) {
        const ll = addPopupRef.current?.getLngLat();
        if (ll) onAddRef.current?.({ lat: ll.lat, lng: ll.lng }, Number(add.getAttribute("data-bl-add")));
        addPopupRef.current?.remove();
      }
    };
    containerRef.current.addEventListener("click", onClick);

    mapRef.current = map;
    return () => {
      containerRef.current?.removeEventListener("click", onClick);
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    // Rebuild markers each update so severity/report_count stay fresh.
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    hazards.forEach((h) => {
      const sev = clampSev(h.severity);
      const color = sevColor(sev);
      const size = 16 + sev * 4;

      const el = document.createElement("div");
      el.style.cssText = `
        width:${size}px;height:${size}px;border-radius:50%;background:${color};
        border:2.5px solid #fff;cursor:pointer;display:flex;align-items:center;
        justify-content:center;font-size:${Math.round(size * 0.5)}px;font-weight:800;
        color:#0a0f1f;box-shadow:0 0 0 ${sev >= 4 ? "6px" : "3px"} ${color}33,
        0 4px 12px rgba(0,0,0,.5);${sev >= 5 ? "animation:pulse 1.5s infinite;" : ""}`;
      el.textContent = sev;

      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(popupHTML(h));
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([h.lng, h.lat])
        .setPopup(popup)
        .addTo(map);

      // Hover shows the popup; a short close delay lets you move into it (to click "resolve").
      el.addEventListener("mouseenter", () => {
        clearTimeout(hoverTimer.current);
        popup.addTo(map);
        const pe = popup.getElement();
        if (pe) {
          pe.addEventListener("mouseenter", () => clearTimeout(hoverTimer.current));
          pe.addEventListener("mouseleave", () => {
            hoverTimer.current = setTimeout(() => popup.remove(), 200);
          });
        }
      });
      el.addEventListener("mouseleave", () => {
        hoverTimer.current = setTimeout(() => popup.remove(), 250);
      });
      markersRef.current.push(marker);
    });
  }, [hazards, loaded]);

  // Fly to the selected region when bounds change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.fitBounds(bounds, { padding: 60, duration: 900 });
  }, [bounds, loaded]);

  // Show the viewer's current location as the usual blue dot (no camera move).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lngLat = [pos.coords.longitude, pos.coords.latitude];
        if (!userMarkerRef.current) {
          const el = document.createElement("div");
          el.style.cssText =
            "width:16px;height:16px;border-radius:50%;background:#2a7fff;" +
            "border:3px solid #fff;box-shadow:0 0 0 6px rgba(42,127,255,0.20),0 1px 6px rgba(0,0,0,0.45);";
          userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
        } else {
          userMarkerRef.current.setLngLat(lngLat);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [loaded]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
