import { useEffect } from "react";
import LandingPage from "./pages/LandingPage.jsx";
import SessionGate from "./components/SessionGate.jsx";
import TeamBalancerPage from "./pages/TeamBalancerPage.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import LegalPage from "./pages/LegalPage.jsx";

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  useEffect(() => {
    const titles = {
      "/app": "Draft Room | DRAFTIX",
      "/team-balance": "Team Balancer | DRAFTIX",
      "/team-balance.html": "Team Balancer | DRAFTIX",
      "/status": "System Status | DRAFTIX",
      "/status.html": "System Status | DRAFTIX",
      "/privacy": "Privacy | DRAFTIX",
      "/privacy.html": "Privacy | DRAFTIX",
      "/terms": "Terms | DRAFTIX",
      "/terms.html": "Terms | DRAFTIX",
    };
    document.title = titles[path] || "DRAFTIX | Valorant Draft Platform";
  }, [path]);
  if (path === "/app") return <SessionGate />;
  if (["/team-balance", "/team-balance.html"].includes(path)) return <TeamBalancerPage />;
  if (["/status", "/status.html"].includes(path)) return <StatusPage />;
  if (["/privacy", "/privacy.html"].includes(path)) return <LegalPage type="privacy" />;
  if (["/terms", "/terms.html"].includes(path)) return <LegalPage type="terms" />;
  return <LandingPage />;
}
