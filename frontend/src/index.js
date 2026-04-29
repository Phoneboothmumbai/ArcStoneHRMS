import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Polyfill crypto.randomUUID for non-secure contexts (e.g., HTTP-only deployments).
// Browsers only expose crypto.randomUUID on HTTPS / localhost; on plain HTTP the
// property is undefined and any code calling it throws, blanking the React tree.
// We patch a spec-compliant fallback using crypto.getRandomValues (always available).
if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID !== "function") {
  window.crypto.randomUUID = function randomUUID() {
    const b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;   // version 4
    b[8] = (b[8] & 0x3f) | 0x80;   // variant 1
    const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
    return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
  };
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
