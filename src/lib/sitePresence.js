import { supabaseConfig } from "./supabaseConfig.js";

// Site-wide live visitor presence. Runs on every page (mounted once in
// App.jsx) and feeds the "N people viewing now" badge in PublicFooter via
// the draftix_presence RPC.
//
//   • Every visitor gets an anonymous Supabase session (isolated storage
//     key so it never conflicts with the draft room client's session).
//   • A heartbeat RPC upserts this visitor's row every 30s.
//   • On pagehide (tab close, navigate away, refresh) a keepalive fetch
//     removes the row immediately — no 2-minute ghost.
//
// Deliberately dependency-light and failure-silent: if Supabase is not
// configured or a ping fails, the badge simply keeps its last value.
//
// @supabase/supabase-js is imported dynamically: this module runs on every
// page (App.jsx mounts it eagerly), and the SDK is only needed once the
// first heartbeat fires — well after first paint. This keeps the SDK out
// of the eager bundle and off the critical path.

const HEARTBEAT_MS = 30_000;

let client = null;
let ready = null;
let timer = null;
let currentPage = "/";

async function getClient() {
  if (client) return client;
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const { createClient } = await import("@supabase/supabase-js");
  if (client) return client; // another concurrent call already won the race
  client = createClient(cfg.url, cfg.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      // Distinct key so this never clashes with the draft room client's
      // persisted session.
      storageKey: "dx-site-presence",
    },
  });
  return client;
}

async function ensureReady() {
  const supabase = getClient();
  if (!supabase) return null;
  if (!ready) {
    ready = (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
    })();
  }
  await ready;
  return supabase;
}

async function ping() {
  try {
    const supabase = await ensureReady();
    if (!supabase) return;
    await supabase.rpc("draftix_visitor_heartbeat", { p_page: currentPage });
  } catch (_) {
    /* transient — the next tick retries */
  }
}

// Called on pagehide: tab close, navigation, refresh, mobile app switch.
// keepalive lets the request complete after the page unloads. The dynamic
// import resolves from the module cache here (the first heartbeat loaded
// it at startup), so the await is a microtask, not a network fetch.
async function leave() {
  const cfg = supabaseConfig();
  if (!cfg) return;
  try {
    const supabase = await getClient();
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    void fetch(`${cfg.url}/rest/v1/rpc/draftix_visitor_leave`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.key,
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: "{}",
    }).catch(() => { });
  } catch (_) { /* best effort */ }
}

export function setSitePresencePage(path) {
  currentPage = String(path || "/");
}

export function startSitePresence() {
  if (timer) return;
  ping();
  timer = window.setInterval(ping, HEARTBEAT_MS);
  window.addEventListener("pagehide", leave);
}

export function stopSitePresence() {
  window.clearInterval(timer);
  timer = null;
  window.removeEventListener("pagehide", leave);
}
