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
      "/app": "Draft Room | Draftix",
      "/team-balance": "Valorant Team Balancer by Rank | Draftix",
      "/status": "Draftix System Status",
      "/privacy": "Privacy Policy | Draftix",
      "/terms": "Terms of Service | Draftix",
    };
    document.title = titles[path] || "Valorant Map Veto & Agent Draft Tool | Draftix";
  }, [path]);
  if (path === "/app") return <SessionGate />;
  if (path === "/team-balance") return <TeamBalancerPage />;
  if (path === "/status") return <StatusPage />;
  if (path === "/privacy") return <LegalPage type="privacy" />;
  if (path === "/terms") return <LegalPage type="terms" />;
  return <LandingPage />;
}
