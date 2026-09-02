/**
 * Internal metrics dashboard UI — /internal/metrics (CSP-safe external script).
 */
(function () {
  const root = document.getElementById("dash-root");
  const grid = document.getElementById("dash-grid");
  const banner = document.getElementById("dash-banner");
  const meta = document.getElementById("dash-meta");
  const params = new URLSearchParams(window.location.search);
  const T = params.get("token");

  function setBanner(cls, html) {
    if (!banner) return;
    banner.className = "dash-banner" + (cls ? " " + cls : "");
    banner.innerHTML = html;
    banner.hidden = false;
  }

  function fmtTime(ms) {
    if (ms == null || Number.isNaN(ms)) return "—";
    try {
      return new Date(ms).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (_) {
      return "—";
    }
  }

  function fmtUptime(sec) {
    if (sec == null || sec < 0) return "—";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function card(label, value, sub) {
    const el = document.createElement("article");
    el.className = "dash-card";
    el.innerHTML =
      '<div class="dash-card-label"></div>' +
      '<div class="dash-card-value"></div>' +
      (sub ? '<div class="dash-card-sub"></div>' : "");
    el.querySelector(".dash-card-label").textContent = label;
    el.querySelector(".dash-card-value").textContent = value;
    const subEl = el.querySelector(".dash-card-sub");
    if (subEl && sub) subEl.textContent = sub;
    return el;
  }

  function section(title) {
    const h = document.createElement("h2");
    h.className = "dash-section-title";
    h.textContent = title;
    return h;
  }

  function tableList(pairs, emptyLabel, formatter) {
    const wrap = document.createElement("div");
    wrap.className = "dash-table";
    if (!pairs || !pairs.length) {
      const p = document.createElement("p");
      p.className = "dash-empty";
      p.textContent = emptyLabel;
      wrap.appendChild(p);
      return wrap;
    }
    for (const [key, value] of pairs) {
      const row = document.createElement("div");
      row.className = "dash-table-row";
      const k = document.createElement("span");
      k.className = "dash-table-key";
      k.textContent = formatter ? formatter(key) : key;
      const v = document.createElement("strong");
      v.textContent = String(value);
      row.appendChild(k);
      row.appendChild(v);
      wrap.appendChild(row);
    }
    return wrap;
  }

  function dailyChart(daily) {
    const wrap = document.createElement("div");
    wrap.className = "dash-chart";
    const max = Math.max(1, ...(daily || []).map((d) => d.views));
    for (const d of daily || []) {
      const col = document.createElement("div");
      col.className = "dash-chart-col";
      const bar = document.createElement("div");
      bar.className = "dash-chart-bar";
      bar.style.height = Math.round((d.views / max) * 100) + "%";
      bar.title = `${d.date}: ${d.views} views · ${d.visitors} visitors`;
      const lbl = document.createElement("span");
      lbl.className = "dash-chart-label";
      lbl.textContent = d.date.slice(8); // day-of-month
      col.appendChild(bar);
      col.appendChild(lbl);
      wrap.appendChild(col);
    }
    return wrap;
  }

  function render(data) {
    if (!grid) return;
    const loading = document.getElementById("dash-loading");
    if (loading) loading.hidden = true;
    grid.textContent = "";
    grid.hidden = false;

    grid.appendChild(section("Server"));
    grid.appendChild(card("Deploy version", String(data.version || "—"), "From APP_VERSION / healthz"));
    grid.appendChild(card("Process uptime", fmtUptime(data.uptimeSec), "Since this instance started"));
    grid.appendChild(card("Snapshot time", fmtTime(data.at), "Last API read"));

    grid.appendChild(section("Live"));
    grid.appendChild(
      card(
        "WebSocket clients",
        String(data.socketsConnected ?? "—"),
        "Socket.io connections right now"
      )
    );
    grid.appendChild(
      card("Peak sockets (boot)", String(data.traffic?.peakSockets ?? "—"), "High-water mark this run")
    );
    grid.appendChild(
      card("Active draft rooms", String(data.draftSessions ?? "—"), "In-memory sessions on this instance")
    );

    grid.appendChild(section("Traffic (this instance)"));
    const tr = data.traffic || {};
    grid.appendChild(card("GET / (landing)", String(tr.landingViews ?? "—"), "Since process start"));
    grid.appendChild(card("GET /app", String(tr.appShellViews ?? "—"), "App shell loads"));
    grid.appendChild(card("Counters since", fmtTime(tr.since), "Resets on deploy / restart"));

    grid.appendChild(section("Visitors & page views"));
    const an = data.analytics || {};
    const today = an.today || {};
    const last7 = an.last7 || {};
    const all = an.allTime || {};
    grid.appendChild(card("Views today", String(today.views ?? "—"), "Page views since midnight UTC"));
    grid.appendChild(card("Visitors today", String(today.visitors ?? "—"), "Unique cookies today"));
    grid.appendChild(card("Views · last 7 days", String(last7.views ?? "—"), "Rolling week"));
    grid.appendChild(card("Visitors · last 7 days", String(last7.visitors ?? "—"), "Unique cookies this week"));
    grid.appendChild(card("All-time views", String(all.views ?? "—"), "Persisted across redeploys"));
    grid.appendChild(card("All-time visitors", String(all.visitors ?? "—"), "Unique visitor cookies"));

    const chartTitle = section("Last 14 days");
    grid.appendChild(chartTitle);
    grid.appendChild(dailyChart(an.daily));

    grid.appendChild(section("Top pages (all tracked days)"));
    grid.appendChild(tableList(an.topPages, "No page views recorded yet."));
    grid.appendChild(section("Top referrers"));
    grid.appendChild(tableList(an.topReferrers, "No external referrers yet."));

    grid.appendChild(section("Catalog"));
    const cat = data.catalog || {};
    grid.appendChild(card("Competitive maps", String(cat.maps ?? "—"), "Valorant API pool"));
    grid.appendChild(card("Agents", String(cat.agents ?? "—"), "Playable agents"));

    setBanner(
      "",
      "These numbers are <strong>per server instance</strong> and reset on redeploy. " +
        "For request latency, CPU, and long-term traffic, use " +
        '<a href="https://render.com/docs/web-service-metrics" rel="noopener noreferrer">Render metrics</a> ' +
        "or an analytics product."
    );

    if (meta) {
      meta.innerHTML =
        "<span>Last fetch: <strong>" +
        fmtTime(Date.now()) +
        "</strong></span>" +
        "<span>Auto-refresh: <strong>12s</strong></span>";
    }
  }

  function renderError(status, bodyText) {
    const loading = document.getElementById("dash-loading");
    if (loading) loading.hidden = true;
    if (grid) {
      grid.hidden = true;
      grid.textContent = "";
    }
    setBanner("err", "<strong>Could not load metrics.</strong> Check the token or sign in to Render and verify <code>ADMIN_STATS_TOKEN</code>.");
    if (meta) meta.textContent = status ? "HTTP " + status : "";
    if (root) {
      const pre = document.createElement("pre");
      pre.style.cssText =
        "margin-top:1rem;padding:1rem;background:#121826;border:1px solid #223047;border-radius:8px;font-size:12px;overflow:auto;max-height:12rem;color:#8899b7";
      pre.textContent = bodyText.slice(0, 2000);
      const old = root.querySelector(".dash-error-dump");
      if (old) old.remove();
      pre.className = "dash-error-dump";
      root.appendChild(pre);
    }
  }

  if (!T) {
    const loading = document.getElementById("dash-loading");
    if (loading) {
      loading.hidden = true;
    }
    setBanner("warn", "Missing <code>token</code> in the URL. Open the link Render gave you or add <code>?token=…</code>.");
    return;
  }

  async function load() {
    try {
      const r = await fetch("/api/admin/stats?token=" + encodeURIComponent(T), { cache: "no-store" });
      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        renderError(r.status, text);
        return;
      }
      if (!r.ok || !data.ok) {
        renderError(r.status, text);
        return;
      }
      const dump = document.querySelector(".dash-error-dump");
      if (dump) dump.remove();
      render(data);
    } catch (e) {
      renderError(0, String(e && e.message ? e.message : e));
    }
  }

  load();
  setInterval(load, 12000);
})();
