import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/landing-redesign.css";
import "./styles/app-redesign.css";
import "./styles/support-pages.css";
import "./styles/typography.css";
import "./styles/tournaments.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
);
