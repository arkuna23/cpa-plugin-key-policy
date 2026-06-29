import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import { initThemeSync } from "./store/themeSync";

// Mirror the host CPA panel's theme (light/white/dark) onto this iframe's
// <html> before React mounts, so the first paint already matches the panel and
// there's no theme flash. No-op / light fallback when opened standalone.
initThemeSync();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
