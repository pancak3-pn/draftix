import { lazy, Suspense, useEffect } from "react";
import LandingPage from "./pages/LandingPage.jsx";
import { trackPageview } from "./lib/analytics.js";

// Lazy-load route pages so the initial bundle stays lean. Only the landing
// page is loaded eagerly; everything else (draft shell, balancer, status,
// legal) is fetched on demand → smaller first load, better LCP.
const SessionGate = lazy(() => import("./components/SessionGate.jsx"));
const TeamBalancerPage = lazy(() => import("./pages/TeamBalancerPage.jsx"));
const StatusPage = lazy(() => import("./pages/StatusPage.jsx"));
const LegalPage = lazy(() => import("./pages/LegalPage.jsx"));
const AdminPage = lazy(() => import("./pages/AdminPage.jsx"));
const SeoTopicPage = lazy(() => import("./pages/SeoTopicPage.jsx"));
const TournamentPage = lazy(() => import("./pages/TournamentPage.jsx"));
const TournamentHubPage = lazy(() => import("./pages/TournamentPage.jsx").then((module) => ({ default: module.TournamentHubPage })));

function RouteFallback() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--dx-bg, #060912)",
        color: "#fff",
        font: "600 1rem/1.4 system-ui, sans-serif",
      }}
      aria-busy="true"
    >
      <p>Loading…</p>
    </main>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  useEffect(() => {
    const titles = {
      "/draft": "Draft Room | Draftix",
      "/team-balance": "Valorant Team Balancer by Rank | Draftix",
      "/status": "Draftix System Status",
      "/privacy": "Privacy Policy | Draftix",
      "/terms": "Terms of Service | Draftix",
      "/r": "Draftix Admin",
      "/valorant-map-veto": "Valorant Map Veto Tool | Draftix",
      "/valorant-agent-ban": "Valorant Agent Ban Tool | Draftix",
      "/valorant-draft-tool": "Free Valorant Draft Tool | Draftix",
      "/tournaments": "Free Tournament Bracket Maker | Draftix",
    };
    document.title = titles[path] || "Valorant Map Veto & Agent Draft Tool | Draftix";
    // First-party analytics: one pageview per route change.
    trackPageview(path);
  }, [path]);

  let page;
  if (path === "/draft") page = <SessionGate />;
  else if (path === "/team-balance") page = <TeamBalancerPage />;
  else if (path === "/status") page = <StatusPage />;
  else if (path === "/privacy") page = <LegalPage type="privacy" />;
  else if (path === "/terms") page = <LegalPage type="terms" />;
  else if (path === "/r") page = <AdminPage />;
  else if (path === "/tournaments") page = <TournamentHubPage />;
  else if (path.startsWith("/t/") && path.split("/").filter(Boolean).length === 2) page = <TournamentPage slug={decodeURIComponent(path.split("/")[2])} />;
  else if (["/valorant-map-veto", "/valorant-agent-ban", "/valorant-draft-tool"].includes(path)) page = <SeoTopicPage path={path} />;
  else page = <LandingPage />;


  // Landing page is already eager; only wrap the lazy routes in Suspense.
  if (path === "/") return page;
  return <Suspense fallback={<RouteFallback />}>{page}</Suspense>;
}
