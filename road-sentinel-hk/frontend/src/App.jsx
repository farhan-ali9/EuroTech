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
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0a0f1e", color: "#f1f5f9" }}>
      <nav style={{
        background: "#0d1525",
        borderBottom: "1px solid #1e293b",
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 52,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 20 }}>
          <span style={{ fontSize: 18 }}>🛡️</span>
          <span style={{ fontWeight: 800, fontSize: 14, color: "#f1f5f9" }}>Road Sentinel DE</span>
        </div>

        <NavLink to="/"    active={pathname === "/"}>Dashboard</NavLink>
        <NavLink to="/gov" active={pathname === "/gov"} highlight>Govt Alerts</NavLink>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>LIVE</span>
        </div>
      </nav>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <Routes>
          <Route path="/"    element={<Dashboard />} />
          <Route path="/gov" element={<GovernmentPortal />} />
        </Routes>
      </div>
    </div>
  );
}

function NavLink({ to, active, children, highlight }) {
  return (
    <Link to={to} style={{
      padding: "5px 12px",
      borderRadius: 6,
      textDecoration: "none",
      fontSize: 12,
      fontWeight: 700,
      background: active ? (highlight ? "#ff3b4a20" : "#1e293b") : "transparent",
      color: active ? (highlight ? "#ff3b4a" : "#f1f5f9") : highlight ? "#f97316" : "#64748b",
      border: highlight ? `1px solid ${active ? "#ff3b4a40" : "#f9731630"}` : "1px solid transparent",
    }}>
      {children}
    </Link>
  );
}
