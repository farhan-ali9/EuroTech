import React from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import DriverMode from "./pages/DriverMode";
import GovernmentPortal from "./pages/GovernmentPortal";

export default function App() {
  const { pathname } = useLocation();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f172a", color: "#f1f5f9" }}>
      <nav style={{
        background: "#0a1120",
        borderBottom: "1px solid #1e293b",
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 54,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 16 }}>
          <div style={{
            width: 28, height: 28,
            background: "linear-gradient(135deg, #ef4444, #f97316)",
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
          }}>
            🛡️
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 13, color: "#f1f5f9", letterSpacing: 0.5 }}>
              ROAD SENTINEL
            </div>
            <div style={{ fontSize: 9, color: "#64748b", letterSpacing: 1, marginTop: -2 }}>
              HONG KONG
            </div>
          </div>
        </div>

        {/* Nav links */}
        <NavLink to="/"        active={pathname === "/"}>Command Centre</NavLink>
        <NavLink to="/drive"   active={pathname === "/drive"}>Driver Mode</NavLink>
        <NavLink to="/gov"     active={pathname === "/gov"} highlight>
          Govt Alerts
        </NavLink>

        {/* Right side */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
              boxShadow: "0 0 6px #22c55e",
            }} />
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>LIVE</span>
          </div>
          <div style={{ fontSize: 11, color: "#334155" }}>|</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>HKO Weather Active</div>
        </div>
      </nav>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <Routes>
          <Route path="/"      element={<Dashboard />} />
          <Route path="/drive" element={<DriverMode />} />
          <Route path="/gov"   element={<GovernmentPortal />} />
        </Routes>
      </div>
    </div>
  );
}

function NavLink({ to, active, children, highlight }) {
  return (
    <Link to={to} style={{
      padding: "6px 14px",
      borderRadius: 7,
      textDecoration: "none",
      fontSize: 12,
      fontWeight: 700,
      background: active
        ? highlight ? "#ef444420" : "#1e293b"
        : "transparent",
      color: active
        ? highlight ? "#ef4444" : "#f1f5f9"
        : highlight ? "#f97316" : "#64748b",
      border: highlight ? `1px solid ${active ? "#ef444440" : "#f9731630"}` : "1px solid transparent",
      letterSpacing: 0.3,
      transition: "all 0.15s",
    }}>
      {children}
    </Link>
  );
}
