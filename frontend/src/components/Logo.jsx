import React from "react";

// Minimal "road bump" glyph — a road line with a bump rising from it.
// color controls the stroke; inherits currentColor by default.
export function Mark({ size = 22, color = "currentColor", strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 17h20"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M5 17c2.2 0 2.6-9 7-9s4.8 9 7 9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
