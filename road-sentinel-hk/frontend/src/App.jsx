import React from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import DriverMode from "./pages/DriverMode";
import GovernmentPortal from "./pages/GovernmentPortal";

export default function App() {
  const { pathname } = useLocation();

  const isDriverView = pathname === "/drive";

  if (isDriverView) {
    return (
      <Routes>
        <Route path="/drive" element={<DriverMode />} />
      </Routes>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#030b18", color: "#f1f5f9" }}>
      <nav style={{
        background: "rgba(6,18,40,0.95)",
        borderBottom: "1px solid rgba(0,212,255,0.12)",
        backdropFilter: "blur(20px)",
        padding: "0 24px",
        display: "flex", alignItems: "center", gap: 8,
        height: 56, flexShrink: 0,
        boxShadow: "0 1px 30px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 24 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #00d4ff, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, boxShadow: "0 0 16px rgba(0,212,255,0.4)",
          }}>🛡️</div>
          <span style={{
            fontWeight: 900, fontSize: 16,
            background: "linear-gradient(135deg, #00d4ff, #3b82f6)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: 0.5,
          }}>RoadSense</span>
        </div>

        <NavLink to="/"    active={pathname === "/"}>Dashboard</NavLink>
        <NavLink to="/gov" active={pathname === "/gov"} highlight>Govt Alerts</NavLink>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#00d4ff", display: "inline-block",
            boxShadow: "0 0 8px #00d4ff",
            animation: "pulse 2s infinite",
          }} />
          <span style={{ fontSize: 11, color: "#00d4ff", fontWeight: 800, letterSpacing: 1 }}>LIVE</span>
        </div>
      </nav>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <Routes>
          <Route path="/"    element={<Dashboard />} />
          <Route path="/gov" element={<GovernmentPortal />} />
        </Routes>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function NavLink({ to, active, children, highlight }) {
  return (
    <Link to={to} style={{
      padding: "6px 14px", borderRadius: 8,
      textDecoration: "none", fontSize: 12, fontWeight: 800,
      background: active
        ? highlight ? "rgba(239,68,68,0.15)" : "rgba(0,212,255,0.1)"
        : "transparent",
      color: active
        ? highlight ? "#ef4444" : "#00d4ff"
        : highlight ? "#f97316" : "#475569",
      border: active
        ? `1px solid ${highlight ? "rgba(239,68,68,0.3)" : "rgba(0,212,255,0.25)"}`
        : "1px solid transparent",
      boxShadow: active && !highlight ? "0 0 12px rgba(0,212,255,0.15)" : "none",
      transition: "all 0.2s",
      letterSpacing: 0.3,
    }}>
      {children}
    </Link>
  );
}
