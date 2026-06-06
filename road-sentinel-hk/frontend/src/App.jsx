import React from "react";
import { Routes, Route } from "react-router-dom";
import DriverView from "./pages/DriverMode";
import GovMap from "./pages/GovernmentPortal";

// Two views only:
//   /     → mobile Driver view (detect + warn)
//   /gov  → Government map (all defects to fix)
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DriverView />} />
      <Route path="/gov" element={<GovMap />} />
    </Routes>
  );
}
