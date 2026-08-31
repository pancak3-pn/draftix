import LandingPage from "./pages/LandingPage.jsx";
import SessionGate from "./components/SessionGate.jsx";
import TeamBalancerPage from "./pages/TeamBalancerPage.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import LegalPage from "./pages/LegalPage.jsx";

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/app") return <SessionGate />;
  if (["/team-balance", "/team-balance.html"].includes(path)) return <TeamBalancerPage />;
  if (["/status", "/status.html"].includes(path)) return <StatusPage />;
  if (["/privacy", "/privacy.html"].includes(path)) return <LegalPage type="privacy" />;
  if (["/terms", "/terms.html"].includes(path)) return <LegalPage type="terms" />;
  return <LandingPage />;
}
