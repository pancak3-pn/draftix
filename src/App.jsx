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
      "/status": "System Status | DRAFTIX",
      "/privacy": "Privacy | DRAFTIX",
      "/terms": "Terms | DRAFTIX",
    };
    document.title = titles[path] || "DRAFTIX | Valorant Draft Platform";
  }, [path]);
  if (path === "/app") return <SessionGate />;
  if (path === "/team-balance") return <TeamBalancerPage />;
  if (path === "/status") return <StatusPage />;
  if (path === "/privacy") return <LegalPage type="privacy" />;
  if (path === "/terms") return <LegalPage type="terms" />;
  return <LandingPage />;
}
