import { useEffect, useState } from "react";
import { AppBrand } from "./AppNav.jsx";
import { supabaseConfig } from "../lib/supabaseConfig.js";

const presenceAgents = ["jett", "phoenix", "sage"];

// Same detection as src/socket/draftSocket.js: when Supabase is configured
// the app runs on the Supabase backend, so the live counter must read from
// the public presence RPC instead of the Express-only /api/presence endpoint.

function LivePresence() {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let alive = true;
    const cfg = supabaseConfig();
    const poll = async () => {
      try {
        let count = 0;
        if (cfg) {
          // Supabase deployment → public presence RPC. Plain fetch (not
          // supabase-js) keeps the eager-loaded landing bundle dependency-free,
          // matching the pattern used by AdminPage.
          const response = await fetch(`${cfg.url}/rest/v1/rpc/draftix_presence`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: cfg.key,
              Authorization: `Bearer ${cfg.key}`,
            },
            body: "{}",
          });
          if (!response.ok) return;
          const data = await response.json();
          count = Number(data?.liveUsers) || 0;
        } else {
          // Express + Socket.IO deployment.
          const response = await fetch("/api/presence", { cache: "no-store" });
          if (!response.ok) return;
          const data = await response.json();
          count = Number(data.liveUsers) || 0;
        }
        if (alive) setLive(count);
      } catch (_) { }
    };
    poll();
    const timer = window.setInterval(poll, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  if (live === null) return null;
  const overflow = Math.max(0, live - presenceAgents.length);
  return <div className="presence-badge" role="status" aria-label={`${live} people viewing now`}>
    <span className="presence-avatars" aria-hidden="true">
      {presenceAgents.map((agent, index) => (
        <img key={agent} src={`/images/agents/${agent}/icon.webp`} alt="" loading="lazy" style={{ zIndex: presenceAgents.length - index }} />
      ))}
      {overflow > 0 && <span className="presence-overflow">+{overflow}</span>}
    </span>
    <span className="presence-text"><strong>{live}</strong> {live === 1 ? "person viewing now" : "people viewing now"}</span>
  </div>;
}

export default function PublicFooter({ reveal = false }) {
  return (
    <footer className={`dr-footer public-footer${reveal ? "" : " is-visible"}`} {...(reveal ? { "data-reveal": true } : {})}>
      <div className="public-footer-main">
        <div className="public-footer-brand">
          <AppBrand className="dr-brand" />
          <p>Valorant drafting and map vetoes for teams, scrims, and tournaments.</p>
          <LivePresence />
        </div>

        <nav className="public-footer-col" aria-label="Draftix product">
          <h2 className="public-footer-heading">Product</h2>
          <a className="public-footer-featured" href="/draft">Open Draftix</a>
          <a href="/team-balance">Team balancer</a>
          <a href="/tournaments">Tournaments</a>
        </nav>

        <nav className="public-footer-col" aria-label="Valorant drafting guides">
          <h2 className="public-footer-heading">Guides</h2>
          <a href="/valorant-map-veto">Map veto guide</a>
          <a href="/valorant-agent-ban">Agent bans guide</a>
          <a href="/valorant-draft-tool">Draft tool guide</a>
        </nav>

        <nav className="public-footer-col" aria-label="Help and resources">
          <h2 className="public-footer-heading">Resources</h2>
          <a href="/status">System status</a>
          <a href="/feedback">Send feedback</a>
          <a className="public-footer-contact" href="https://mail.google.com/mail/?view=cm&fs=1&to=support%40draftix.tech" target="_blank" rel="noreferrer">Email support</a>
        </nav>
      </div>

      <div className="public-footer-utility">
        <div className="public-footer-legal-note">
          <small>{"©"} {new Date().getFullYear()} DRAFTIX</small>
          <small>Not endorsed by Riot Games. Valorant and Riot Games are trademarks of Riot Games, Inc.</small>
        </div>
        <nav aria-label="Legal and site info">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
        <a className="public-footer-donate" href="https://ko-fi.com/dartzski" target="_blank" rel="noreferrer" aria-label="Clutch the server bill on Ko-fi">Clutch the server bill</a>
      </div>
    </footer>
  );
}
