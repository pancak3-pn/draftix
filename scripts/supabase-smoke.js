const fs = require("node:fs");
const { createClient } = require("@supabase/supabase-js");

function localEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return env;
}

function clientFor(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

(async () => {
  const env = localEnv();
  const host = clientFor(env);
  const guest = clientFor(env);
  const [{ error: hostAuthError }, { error: guestAuthError }] = await Promise.all([
    host.auth.signInAnonymously(), guest.auth.signInAnonymously(),
  ]);
  if (hostAuthError) throw hostAuthError;
  if (guestAuthError) throw guestAuthError;

  const catalog = {
    maps: ["Ascent", "Bind", "Haven"].map((name) => ({ uuid: `smoke-map-${name.toLowerCase()}`, name, image: `/images/maps/${name.toLowerCase()}.webp` })),
    agents: ["Jett", "Sage", "Sova", "Omen"].map((name) => ({ uuid: `smoke-agent-${name.toLowerCase()}`, name, image: "/images/draftix.webp" })),
  };
  const created = await rpc(host, "draftix_create_room", { p_nickname: "Alpha", p_catalog: catalog });
  await rpc(guest, "draftix_join_room", { p_code: created.code, p_nickname: "Bravo" });
  let state = await rpc(host, "draftix_room_state", { p_code: created.code });

  let resolveRealtime;
  let rejectRealtime;
  let realtimeEventTimeout;
  const realtimeUpdate = new Promise((resolve, reject) => {
    resolveRealtime = resolve;
    rejectRealtime = reject;
  });
  const realtimeChannel = guest.channel(`smoke:${state._roomId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "draft_rooms", filter: `id=eq.${state._roomId}` }, (payload) => { clearTimeout(realtimeEventTimeout); resolveRealtime(payload); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime room update timed out")), 7000);
    realtimeChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timeout); rejectRealtime(new Error(status)); reject(new Error(status)); }
    });
  });
  realtimeEventTimeout = setTimeout(() => rejectRealtime(new Error("Realtime room event timed out")), 7000);

  await rpc(host, "draftix_action", { p_code: created.code, p_action: "claimCaptain", p_payload: { team: "A" } });
  await rpc(guest, "draftix_action", { p_code: created.code, p_action: "claimCaptain", p_payload: { team: "B" } });
  await rpc(host, "draftix_action", { p_code: created.code, p_action: "setGameSettings", p_payload: { draftPreset: "quick", agentBanCount: 0, turnTimeoutMs: 15000, autoBanEnabled: false, sidePickEnabled: false } });
  await rpc(host, "draftix_action", { p_code: created.code, p_action: "startDraft", p_payload: {} });
  await realtimeUpdate;

  state = await rpc(host, "draftix_room_state", { p_code: created.code });
  const acting = state.currentTurn === "A" ? host : guest;
  await rpc(acting, "draftix_action", { p_code: created.code, p_action: "banMap", p_payload: { uuid: state.catalog.maps[0].uuid } });
  state = await rpc(host, "draftix_room_state", { p_code: created.code });
  if (state.mapBans.length !== 1 || !state.ops.canUndo) throw new Error("Ban or undo state did not persist");
  await rpc(host, "draftix_undo", { p_code: created.code });
  state = await rpc(host, "draftix_room_state", { p_code: created.code });
  if (state.mapBans.length !== 0) throw new Error("Undo did not restore the draft");

  await rpc(guest, "draftix_leave_room", { p_code: created.code });
  await rpc(host, "draftix_leave_room", { p_code: created.code });
  await Promise.all([host.removeAllChannels(), guest.removeAllChannels()]);
  console.log(`PASS Supabase: auth, room ${created.code}, Realtime, captains, veto, undo, cleanup`);
})().catch((error) => {
  console.error("FAIL Supabase:", error.message || error);
  process.exitCode = 1;
});
