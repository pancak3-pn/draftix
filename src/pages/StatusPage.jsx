import { useEffect, useState } from "react";
import SiteHeader from "../components/SiteHeader.jsx";
import PublicFooter from "../components/PublicFooter.jsx";

function uptime(seconds = 0) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days
    ? `${days}d ${hours}h ${minutes}m`
    : hours
      ? `${hours}h ${minutes}m`
      : `${minutes}m`;
}

const copy = {
  loading: { eyebrow: "Running health check", title: "Checking Draftix", description: "Contacting the live drafting service." },
  online: { eyebrow: "All systems normal", title: "Drafting is operational", description: "Rooms, live draft updates, and game data are available." },
  degraded: { eyebrow: "Partial disruption", title: "Draftix is degraded", description: "The service responded, but one or more checks need attention." },
  offline: { eyebrow: "Service interruption", title: "Draftix is unreachable", description: "The health service could not be reached. Existing browser sessions may be affected." },
};

export default function StatusPage() {
  const [status, setStatus] = useState({ state: "loading", data: null, updated: null });

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/healthz", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (active) setStatus({ state: data.ok ? "online" : "degraded", data, updated: new Date() });
      } catch (error) {
        if (active) setStatus({ state: "offline", data: null, updated: new Date(), error: error.message });
      }
    };
    check();
    const timer = window.setInterval(check, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const { data } = status;
  const message = copy[status.state];
  const catalogReady = Boolean(data?.catalog?.maps && data?.catalog?.agents);
  const serviceState = status.state === "online" ? "Operational" : status.state === "loading" ? "Checking" : "Unavailable";
  const services = [
    ["Draft rooms", "Room creation, joining, and reconnects", serviceState, status.state],
    ["Live draft sync", "Map vetoes, side picks, agent bans, and chat", serviceState, status.state],
    ["Game catalog", "Maps and agents used by every draft", status.state === "loading" ? "Checking" : catalogReady ? "Operational" : "Unavailable", catalogReady ? "online" : status.state],
  ];

  return (
    <main className="sp-page status-page">
      <SiteHeader />
      <section className="status-hero" aria-live="polite">
        <div className={`status-signal is-${status.state}`} aria-hidden="true" />
        <div className="status-hero-copy">
          <span>{message.eyebrow}</span>
          <h1>{message.title}</h1>
          <p>{message.description}</p>
        </div>
        <dl className="status-check-meta">
          <div><dt>Last checked</dt><dd>{status.updated?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) || "Waiting"}</dd></div>
          <div><dt>Refresh</dt><dd>Every 5 seconds</dd></div>
        </dl>
      </section>

      <section className="status-board" aria-labelledby="services-title">
        <header>
          <div><span>Live services</span><h2 id="services-title">Draft infrastructure</h2></div>
          <b className={`is-${status.state}`}>{serviceState}</b>
        </header>
        <div className="status-services">
          {services.map(([name, description, state, tone]) => (
            <article key={name}>
              <i className={`is-${tone}`} aria-hidden="true" />
              <div><h3>{name}</h3><p>{description}</p></div>
              <strong>{state}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="status-metrics" aria-label="Runtime metrics">
        <article><span>Release</span><strong>{data?.version ? `v${data.version}` : "—"}</strong><p>Current server build</p></article>
        <article><span>Uptime</span><strong>{data ? uptime(data.uptimeSec) : "—"}</strong><p>Since latest restart</p></article>
        <article><span>Live rooms</span><strong>{data?.sessions ?? "—"}</strong><p>Active draft sessions</p></article>
        <article><span>Catalog</span><strong>{data ? `${data.catalog?.maps || 0} / ${data.catalog?.agents || 0}` : "—"}</strong><p>Maps / agents loaded</p></article>
      </section>

      <section className={`status-incident is-${status.state}`}>
        <span>{status.state === "online" ? "No active incidents" : status.state === "loading" ? "Awaiting first health check" : "Active service notice"}</span>
        <p>{status.state === "online" ? "Draftix is operating normally." : status.error || message.description}</p>
      </section>

      <PublicFooter />
    </main>
  );
}
