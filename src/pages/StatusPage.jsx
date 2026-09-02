import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import SiteHeader from "../components/SiteHeader.jsx";
import PublicFooter from "../components/PublicFooter.jsx";
import { getValorantCatalog } from "../lib/valorantCatalog.js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
const supabaseKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

const copy = {
  loading: { eyebrow: "Running health check", title: "Checking Draftix", description: "Contacting the live drafting services." },
  online: { eyebrow: "All systems normal", title: "Drafting is operational", description: "Rooms, live draft updates, and game data are available." },
  degraded: { eyebrow: "Partial disruption", title: "Draftix is degraded", description: "One or more drafting services need attention." },
  offline: { eyebrow: "Service interruption", title: "Draftix is unreachable", description: "The production drafting services could not be reached." },
};

async function checkDatabase() {
  const response = await fetch(`${supabaseUrl}/rest/v1/draft_rooms?select=id&limit=1`, {
    cache: "no-store",
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (!response.ok) throw new Error(`Database gateway returned HTTP ${response.status}`);
}

async function checkRealtime() {
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const channel = client.channel(`status:${crypto.randomUUID()}`);
  try {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Realtime check timed out")), 6000);
      channel.subscribe((channelStatus) => {
        if (channelStatus === "SUBSCRIBED") {
          window.clearTimeout(timeout);
          resolve();
        } else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
          window.clearTimeout(timeout);
          reject(new Error("Realtime service is unavailable"));
        }
      });
    });
  } finally {
    await client.removeChannel(channel);
  }
}

async function runHealthCheck() {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase is not configured for this deployment");
  const startedAt = performance.now();
  const [database, realtime, catalog] = await Promise.allSettled([
    checkDatabase(),
    checkRealtime(),
    getValorantCatalog(),
  ]);
  const checks = {
    database: database.status === "fulfilled",
    realtime: realtime.status === "fulfilled",
    catalog: catalog.status === "fulfilled",
  };
  const catalogData = catalog.status === "fulfilled" ? catalog.value : null;
  const available = Object.values(checks).filter(Boolean).length;
  return {
    state: available === 3 ? "online" : available > 0 ? "degraded" : "offline",
    checks,
    latencyMs: Math.round(performance.now() - startedAt),
    catalog: { maps: catalogData?.maps?.length || 0, agents: catalogData?.agents?.length || 0 },
    errors: [database, realtime, catalog]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || "Health check failed"),
  };
}

function checkView(status, key) {
  if (status.state === "loading") return ["Checking", "loading"];
  return status.data?.checks?.[key] ? ["Operational", "online"] : ["Unavailable", "offline"];
}

export default function StatusPage() {
  const [status, setStatus] = useState({ state: "loading", data: null, updated: null });

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const data = await runHealthCheck();
        if (active) setStatus({ state: data.state, data, updated: new Date(), error: data.errors[0] });
      } catch (error) {
        if (active) setStatus({ state: "offline", data: null, updated: new Date(), error: error.message });
      }
    };
    check();
    const timer = window.setInterval(check, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const { data } = status;
  const message = copy[status.state];
  const serviceState = status.state === "online" ? "Operational" : status.state === "loading" ? "Checking" : status.state === "degraded" ? "Degraded" : "Unavailable";
  const database = checkView(status, "database");
  const realtime = checkView(status, "realtime");
  const catalog = checkView(status, "catalog");
  const services = [
    ["Draft rooms", "Room creation, joining, and reconnects", ...database],
    ["Live draft sync", "Map vetoes, side picks, agent bans, and chat", ...realtime],
    ["Game catalog", "Maps and agents used by every draft", ...catalog],
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
          <div><dt>Refresh</dt><dd>Every 15 seconds</dd></div>
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
        <article><span>Database</span><strong>{database[0]}</strong><p>Supabase REST gateway</p></article>
        <article><span>Realtime</span><strong>{realtime[0]}</strong><p>Live room synchronization</p></article>
        <article><span>Response</span><strong>{data?.latencyMs ? `${data.latencyMs} ms` : "--"}</strong><p>Complete health check</p></article>
        <article><span>Catalog</span><strong>{data ? `${data.catalog.maps} / ${data.catalog.agents}` : "--"}</strong><p>Maps / agents loaded</p></article>
      </section>

      <section className={`status-incident is-${status.state}`}>
        <span>{status.state === "online" ? "No active incidents" : status.state === "loading" ? "Awaiting first health check" : "Active service notice"}</span>
        <p>{status.state === "online" ? "Draftix is operating normally." : status.error || message.description}</p>
      </section>

      <PublicFooter />
    </main>
  );
}
