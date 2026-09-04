import { createClient } from "@supabase/supabase-js";
import { friendlyDraftError } from "./draftErrors";
import { getValorantCatalog } from "../lib/valorantCatalog";

function messageView(row) {
  return {
    id: row.id,
    ts: new Date(row.created_at).getTime(),
    fromId: row.user_id,
    fromName: row.nickname,
    team: row.team,
    isCap: row.is_captain,
    isHost: row.is_host,
    text: row.body,
  };
}

export function createSupabaseDraftClient({ url, key, onState, onChat, onConnection, onError }) {
  const supabase = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  let channel = null;
  let roomCode = "";
  let closed = false;
  let refreshTimer = null;

  const ready = (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    }
    if (!closed) onConnection?.("online");
  })().catch((error) => {
    onConnection?.("offline");
    onError?.(friendlyDraftError(error, "connect"));
    throw error;
  });

  async function stateFor(code = roomCode) {
    if (!code) return null;
    const { data, error } = await supabase.rpc("draftix_room_state", { p_code: code });
    if (error) throw error;
    const logoResult = await supabase.rpc("draftix_team_logos", { p_code: code });
    return { ...data, teamLogos: logoResult.error ? { A: null, B: null } : logoResult.data };
  }

  async function refresh() {
    try {
      const state = await stateFor();
      if (state && !closed) onState?.(state);
      return state;
    } catch (error) {
      if (!closed) onError?.(friendlyDraftError(error, "sync"));
      return null;
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, 35);
  }

  async function subscribe(state) {
    if (channel) await supabase.removeChannel(channel);
    const roomId = state._roomId;
    channel = supabase
      .channel(`draftix:${roomId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "draft_rooms", filter: `id=eq.${roomId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_players", filter: `room_id=eq.${roomId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "draft_messages", filter: `room_id=eq.${roomId}` }, ({ new: row }) => onChat?.(messageView(row)));
    await new Promise((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") { onConnection?.("online"); resolve(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          onConnection?.("offline");
          reject(new Error("Realtime channel could not subscribe"));
        }
      });
    });
  }

  async function openRoom(code) {
    roomCode = String(code || "").trim().toUpperCase();
    const state = await stateFor(roomCode);
    onState?.(state);
    await subscribe(state);
    return state;
  }

  async function rpcResult(work, callback, context = "action") {
    try {
      await ready;
      const result = await work();
      if (result.error) throw result.error;
      const value = result.data || { ok: true };
      callback?.(value);
      return value;
    } catch (error) {
      const value = { ok: false, error: friendlyDraftError(error, context) };
      onError?.(value.error);
      callback?.(value);
      return value;
    }
  }

  const socket = {
    emit(event, payload = {}, callback) {
      return rpcResult(async () => {
        const code = String(payload.code || roomCode).trim().toUpperCase();
        const actionPayload = { ...payload };
        delete actionPayload.code;
        const specialRpc = event === "undoDraftAction" ? "draftix_undo" : event === "expireTurn" ? "draftix_expire_turn" : event === "leaveSession" ? "draftix_leave_room" : event === "setTeamLogos" ? "draftix_set_team_logos" : event === "setGameSettings" ? "draftix_set_game_settings" : null;
        let result = specialRpc
          ? await supabase.rpc(specialRpc, event === "setTeamLogos" ? { p_code: code, p_logos: actionPayload } : event === "setGameSettings" ? { p_code: code, p_settings: actionPayload } : { p_code: code })
          : await supabase.rpc("draftix_action", { p_code: code, p_action: event, p_payload: actionPayload });
        if (event === "setGameSettings" && result.error && ["PGRST202", "42883"].includes(result.error.code)) {
          result = await supabase.rpc("draftix_action", { p_code: code, p_action: event, p_payload: actionPayload });
        }
        if (!result.error && event !== "leaveSession") await refresh();
        if (!result.error && event === "leaveSession") {
          roomCode = "";
          if (channel) await supabase.removeChannel(channel);
          channel = null;
        }
        return result;
      }, callback, event);
    },
  };

  return {
    socket,
    create: (nickname, callback) => rpcResult(async () => {
      const catalog = await getValorantCatalog();
      const result = await supabase.rpc("draftix_create_room", { p_nickname: nickname, p_catalog: catalog });
      if (!result.error && result.data?.code) await openRoom(result.data.code);
      return result;
    }, callback, "create"),
    join: (code, nickname, callback) => rpcResult(async () => {
      const normalized = String(code || "").trim().toUpperCase();
      const result = await supabase.rpc("draftix_join_room", { p_code: normalized, p_nickname: nickname });
      if (!result.error) await openRoom(normalized);
      return result;
    }, callback, "join"),
    close: async () => {
      closed = true;
      window.clearTimeout(refreshTimer);
      if (channel) await supabase.removeChannel(channel);
      onConnection?.("offline");
    },
  };
}
