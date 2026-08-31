import { useEffect, useState } from "react";
import SiteHeader from "../components/SiteHeader.jsx";

function uptime(seconds = 0) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h ${minutes}m` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

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
  return <main className="sp-page"><SiteHeader /><section className="status-head"><div className={`status-signal is-${status.state}`} /><div><h1>{status.state === "online" ? "All systems operational" : status.state === "loading" ? "Checking systems" : status.state === "degraded" ? "Service degraded" : "Server unreachable"}</h1><p>Live server health, refreshed every five seconds.</p></div></section><section className="status-grid"><article><span>Service</span><strong>{status.state.toUpperCase()}</strong><p>{status.error || "Accepting traffic"}</p></article><article><span>Version</span><strong>{data?.version ? `v${data.version}` : "Not available"}</strong><p>Current server release</p></article><article><span>Uptime</span><strong>{data ? uptime(data.uptimeSec) : "Not available"}</strong><p>Since the latest restart</p></article><article><span>Live rooms</span><strong>{data?.sessions ?? "Not available"}</strong><p>Active draft sessions</p></article><article><span>Catalog</span><strong>{data ? `${data.catalog?.maps || 0} maps` : "Not available"}</strong><p>{data ? `${data.catalog?.agents || 0} agents loaded` : "Waiting for server"}</p></article><article><span>Turn timer</span><strong>{data ? `${Math.round(data.turnTimeoutMs / 1000)}s` : "Not available"}</strong><p>Maximum time per action</p></article></section><p className="status-updated">Last check: {status.updated?.toLocaleTimeString() || "waiting"}</p><footer className="sp-footer"><a href="/">Home</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></footer></main>;
}
