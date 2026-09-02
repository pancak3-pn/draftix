import { useEffect, useState } from "react";
import "../styles/admin.css";

const TOKEN_KEY = "dx_admin_token";

function supabaseConfig() {
  const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

/* ── Small inline icon set (stroke icons, currentColor) ─────────────── */
const Icon = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 15.4c1.7.7 2.7 2.2 3 4.6" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  ),
  infinity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.2 8.5a3.9 3.9 0 0 1 0 7c-2.9 0-4.4-3.5-6.2-3.5S8.7 15.5 5.8 15.5a3.9 3.9 0 0 1 0-7c2.9 0 4.4 3.5 6.2 3.5s3.3-3.5 6.2-3.5Z" />
    </svg>
  ),
  door: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" /><circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5M9 13h6M9 17h6" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  ),
};

function StatCard({ label, value, sub, icon }) {
  return (
    <article className="ax-card">
      <div className="ax-card-top">
        <span className="ax-card-label">{label}</span>
        <span className="ax-card-icon">{icon}</span>
      </div>
      <div className="ax-card-value">{value}</div>
      {sub ? <div className="ax-card-sub">{sub}</div> : null}
    </article>
  );
}

function RankedList({ id, title, icon, pairs, emptyText }) {
  return (
    <section className="ax-panel" id={id}>
      <h3>
        <span className="ax-panel-icon">{icon}</span>
        {title}
      </h3>
      {pairs && pairs.length ? (
        <ul className="ax-list">
          {pairs.map(([key, value]) => (
            <li key={key}>
              <span>{key}</span>
              <strong>{value}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ax-empty">{emptyText}</p>
      )}
    </section>
  );
}

/* SVG line chart with gradient area fill, matching the reference layout. */
function DailyChart({ daily }) {
  if (!daily || !daily.length) return null;
  const W = 720;
  const H = 240;
  const PAD = { top: 16, right: 12, bottom: 26, left: 44 };
  const views = daily.map((d) => Number(d.views) || 0);
  const max = Math.max(1, ...views);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (daily.length === 1 ? iw / 2 : (i / (daily.length - 1)) * iw);
  const y = (v) => PAD.top + ih - (v / max) * ih;
  const pts = views.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${PAD.left},${PAD.top + ih} ${pts} ${PAD.left + iw},${PAD.top + ih}`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n));

  return (
    <section className="ax-panel ax-chart-panel">
      <h3>
        <span className="ax-panel-icon">{Icon.grid}</span>
        Views over time
        <span className="ax-panel-note">last {daily.length} days</span>
      </h3>
      <svg
        className="ax-linechart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Page views per day, last ${daily.length} days`}
      >
        <defs>
          <linearGradient id="axArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff4655" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff4655" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridLines.map((g) => {
          const gy = PAD.top + ih - g * ih;
          return (
            <g key={g}>
              <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} className="ax-grid-line" />
              <text x={PAD.left - 8} y={gy + 3.5} className="ax-tick" textAnchor="end">
                {fmt(Math.round(max * g))}
              </text>
            </g>
          );
        })}
        <polygon points={area} fill="url(#axArea)" />
        <polyline points={pts} fill="none" stroke="#ff4655" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {views.map((v, i) => (
          <circle key={daily[i].date} cx={x(i)} cy={y(v)} r="3.5" fill="#ff4655">
            <title>{`${daily[i].date}: ${v} views · ${daily[i].visitors} visitors`}</title>
          </circle>
        ))}
        <text x={PAD.left} y={H - 8} className="ax-tick">{daily[0].date.slice(5)}</text>
        <text x={W - PAD.right} y={H - 8} className="ax-tick" textAnchor="end">{daily[daily.length - 1].date.slice(5)}</text>
      </svg>
    </section>
  );
}

function fmtInt(n) {
  return new Intl.NumberFormat().format(Number(n) || 0);
}

export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const [input, setInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tick, setTick] = useState(0); // re-renders the "updated Xs ago" label
  const [activeView, setActiveView] = useState("overview");


  useEffect(() => {
    // Keep crawlers and link previews away from the admin shell.
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex,nofollow";
  }, []);

  // Auto-load stats when a saved token exists (e.g. returning visit),
  // and whenever the token changes after sign-in.
  useEffect(() => {
    if (token) loadStats(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-refresh every 60s while the dashboard is open.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => loadStats(token), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Tick every 5s so the "updated Xs ago" label stays fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);


  async function loadStats(t) {
    const cfg = supabaseConfig();
    if (!cfg) {
      setError("Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing).");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Plain fetch (not supabase-js) avoids client-side request rewriting
      // by privacy extensions and keeps the admin path dependency-free.
      const res = await fetch(`${cfg.url}/rest/v1/rpc/draftix_admin_stats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
        },
        body: JSON.stringify({ p_token: t }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStats(null);
        setError(payload?.message || `Request failed (HTTP ${res.status}).`);
        sessionStorage.removeItem(TOKEN_KEY);
        return;
      }
      setStats(payload);
      setUpdatedAt(Date.now());
      sessionStorage.setItem(TOKEN_KEY, t);
    } catch (e) {
      setStats(null);
      setError(e?.message || "Network error: could not reach Supabase.");
      sessionStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }

  function signIn(event) {
    event.preventDefault();
    const t = input.trim();
    if (!t) return;
    setInput("");
    setToken(t); // triggers the auto-load effect
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setStats(null);
    setInput("");
  }

  if (!token || !stats) {
    return (
      <div className="ax-app">
        <aside className="ax-side ax-login-side">
          <div className="ax-login-brand">
            <img src="/images/draftix.png" alt="Draftix" />
            <span className="ax-logo-word">
              DRAFT<em>IX</em>
            </span>
          </div>
          <div className="ax-login-context">
            <span className="ax-kicker">Private workspace</span>
            <h2>Keep the room<br /><span>running.</span></h2>
            <p>Review traffic, room activity, and the pages players use most.</p>
          </div>
          <span className="ax-login-mark" aria-hidden="true">01</span>
        </aside>
        <main className="ax-main">
          <header className="ax-topbar">
            <div className="ax-topbar-title">
              <span className="ax-topbar-icon">{Icon.clock}</span>
              <div>
                <h1>Admin console</h1>
                <p>Private traffic and usage monitor for Draftix.</p>
              </div>
            </div>
          </header>
          <div className="ax-content">
            <form className="ax-signin" onSubmit={signIn} aria-label="Draftix admin sign-in">
              <img className="ax-minimal-brand" src="/images/draftix.png" alt="Draftix" />
              <span className="ax-kicker">Private access</span>
              <h2>Admin access</h2>
              <p className="ax-signin-intro">Enter the private admin token to continue.</p>
              <label>
                <span>Admin token</span>
                <div className="ax-token-field">
                  <input
                    type={showToken ? "text" : "password"}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Paste your admin token"
                    autoComplete="current-password"
                    autoFocus
                  />
                  <button type="button" className="ax-token-toggle" onClick={() => setShowToken((visible) => !visible)} aria-label={showToken ? "Hide admin token" : "Show admin token"}>
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <button type="submit" className="ax-button" disabled={!input.trim() || loading} aria-busy={loading}>
                {loading ? "Checking…" : "Unlock dashboard"}
              </button>
              {error ? <p className="ax-error" role="alert">{error}</p> : null}
            </form>
          </div>
        </main>
      </div>
    );
  }

  const ago = updatedAt
    ? (() => {
        const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
        return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
      })()
    : null;

  return (
    <div className="ax-app">
      <aside className="ax-side">
        <div className="ax-logo">
          <img className="ax-logo-image" src="/images/draftix.png" alt="" />
          <span className="ax-logo-word">
            DRAFT<em>IX</em>
          </span>
        </div>
        <nav className="ax-nav" aria-label="Admin sections">
          <button type="button" className={activeView === "overview" ? "ax-nav-active" : "ax-nav-item"} onClick={() => setActiveView("overview")}>
            <span className="ax-nav-icon">{Icon.grid}</span>
            Overview
          </button>
          <button type="button" className={activeView === "rooms" ? "ax-nav-active" : "ax-nav-item"} onClick={() => setActiveView("rooms")}>
            <span className="ax-nav-icon">{Icon.door}</span>
            Draft Rooms
          </button>
          <button type="button" className={activeView === "pages" ? "ax-nav-active" : "ax-nav-item"} onClick={() => setActiveView("pages")}>
            <span className="ax-nav-icon">{Icon.doc}</span>
            Top Pages
          </button>
          <button type="button" className={activeView === "referrers" ? "ax-nav-active" : "ax-nav-item"} onClick={() => setActiveView("referrers")}>
            <span className="ax-nav-icon">{Icon.link}</span>
            Referrers
          </button>
        </nav>
        <div className="ax-side-footer">
          <span className="ax-avatar">A</span>
          <div className="ax-side-user">
            <strong>Admin</strong>
            <button type="button" className="ax-link" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="ax-main">
        <header className="ax-topbar">
          <div className="ax-topbar-title">
            <span className="ax-topbar-icon">{Icon.clock}</span>
            <div>
              <h1>{activeView === "overview" ? "Overview" : activeView === "rooms" ? "Draft Rooms" : activeView === "pages" ? "Top Pages" : "Referrers"}</h1>
              <p>Traffic and usage across Draftix.</p>
            </div>
          </div>
          <div className="ax-topbar-tools">
            <span className="ax-updated">
              {tick >= 0 && ago ? `Updated ${ago} · auto-refresh 60s` : null}
            </span>
            <button
              type="button"
              className="ax-refresh"
              onClick={() => loadStats(token)}
              disabled={loading}
            >
              <span className="ax-btn-icon">{Icon.refresh}</span>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        <div className="ax-content">
          {error ? <p className="ax-error ax-banner-error" role="alert">{error}</p> : null}
          {loading && !stats ? <p className="ax-loading">Loading metrics…</p> : null}

          {stats ? (
            <>
              {activeView === "overview" ? <div className="ax-cards">
                <StatCard label="Views today" value={fmtInt(stats.today?.views)} sub="Since midnight UTC" icon={Icon.eye} />
                <StatCard label="Visitors today" value={fmtInt(stats.today?.visitors)} sub="Unique anonymous visitors" icon={Icon.users} />
                <StatCard label="Views · 7 days" value={fmtInt(stats.last7?.views)} sub="Rolling week" icon={Icon.calendar} />
                <StatCard label="Visitors · 7 days" value={fmtInt(stats.last7?.visitors)} sub="Unique this week" icon={Icon.users} />
                <StatCard label="All-time views" value={fmtInt(stats.allTime?.views)} sub={`${fmtInt(stats.allTime?.visitors)} unique visitors`} icon={Icon.infinity} />
              </div> : null}

              {activeView === "overview" || activeView === "rooms" ? <div className="ax-row">
                {activeView === "overview" ? <DailyChart daily={stats.daily} /> : null}
                {stats.rooms ? (
                  <section className="ax-panel ax-rooms" id="ax-rooms">
                    <h3>
                      <span className="ax-panel-icon">{Icon.door}</span>
                      Draft rooms
                    </h3>
                    <div className="ax-roomstat">
                      <span className="ax-roomstat-num">{fmtInt(stats.rooms.total)}</span>
                      <span className="ax-roomstat-label">total rooms created</span>
                    </div>
                    <div className="ax-roomstat">
                      <span className="ax-roomstat-num">{fmtInt(stats.rooms.today)}</span>
                      <span className="ax-roomstat-label">created today</span>
                    </div>
                  </section>
                ) : null}
              </div> : null}

              {activeView === "overview" || activeView === "pages" || activeView === "referrers" ? <div className="ax-row">
                {activeView === "overview" || activeView === "pages" ? <RankedList id="ax-pages" title="Top pages" icon={Icon.doc} pairs={stats.topPages} emptyText="No pageviews recorded yet." /> : null}
                {activeView === "overview" || activeView === "referrers" ? <RankedList id="ax-referrers" title="Top referrers" icon={Icon.link} pairs={stats.topReferrers} emptyText="No external referrers yet." /> : null}
              </div> : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
