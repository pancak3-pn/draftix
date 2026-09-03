import { useEffect, useState } from "react";
import { AppBrand } from "./AppNav.jsx";

const presenceAgents = ["jett", "phoenix", "sage"];

function LivePresence() {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/presence", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (alive) setLive(Number(data.liveUsers) || 0);
      } catch (_) {}
    };
    poll();
    const timer = window.setInterval(poll, 10_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  if (live === null) return null;
  const overflow = Math.max(0, live - presenceAgents.length);
  return <div className="presence-badge" role="status" aria-label={`${live} people viewing now`}>
    <span className="presence-avatars" aria-hidden="true">
      {presenceAgents.map((agent, index) => (
        <img key={agent} src={`/images/agents/${agent}/icon.png`} alt="" loading="lazy" style={{ zIndex: presenceAgents.length - index }} />
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

        <nav className="public-footer-primary" aria-label="Draftix tools">
          <a href="/draft">Open Draftix</a>
          <a href="/team-balance">Team balancer</a>
          <a href="/tournaments">Tournaments</a>
        </nav>
      </div>

      <div className="public-footer-utility">
        <small>{"©"} {new Date().getFullYear()} DRAFTIX</small>
        <nav aria-label="Footer information">
          <a href="/status">Status</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a className="public-footer-contact" href="https://mail.google.com/mail/?view=cm&fs=1&to=support%40draftix.tech" target="_blank" rel="noreferrer">Email support</a>
          <a className="public-footer-donate" href="https://ko-fi.com/dartzski" target="_blank" rel="noreferrer" aria-label="Clutch the server bill on Ko-fi">Clutch the server bill</a>
        </nav>
      </div>
    </footer>
  );
}
