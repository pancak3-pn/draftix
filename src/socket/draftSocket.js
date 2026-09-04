import { io } from "socket.io-client";
import { getResumeToken, saveResumeToken } from "../state/draftReducer";
import { createSupabaseDraftClient } from "./supabaseDraftClient";
import { friendlyDraftError } from "./draftErrors";

/**
 * Draft transport factory — two supported backends, not a primary + dead code:
 *
 * 1. Supabase (preferred): active when VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
 *    are set. Rooms live in Postgres; realtime channels push updates. Reconnects
 *    resume automatically because draftix_join_room upserts by the persistent
 *    anonymous auth UID — no resume token needed.
 * 2. Socket.IO (self-hosted fallback): the Node server in server.js, deployed per
 *    DEPLOY.md ("Recommended split deployment"). Resume tokens are THIS path's
 *    reconnect mechanism: the server keeps a player's seat tied to their token
 *    for a grace window, so a refresh or Wi-Fi drop restores host/captain/team
 *    roles. See test/test-resume.js.
 *
 * Both clients expose the same surface ({ socket, create, join, close }) and the
 * UI drives them identically via client.socket.emit(event, { code, ...payload }).
 */
export function createDraftSocket({ onState, onChat, onConnection, onError }) {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
  const supabaseKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (supabaseUrl && supabaseKey) {
    return createSupabaseDraftClient({ url: supabaseUrl, key: supabaseKey, onState, onChat, onConnection, onError });
  }
  const configuredUrl = String(import.meta.env.VITE_SOCKET_URL || "").trim().replace(/\/$/, "");
  const socket = io(configuredUrl || undefined, { transports: ["websocket", "polling"] });
  socket.on("connect", () => onConnection?.("online"));
  socket.on("disconnect", () => onConnection?.("offline"));
  socket.on("connect_error", () => onConnection?.("offline"));
  socket.on("state", onState);
  socket.on("chat", onChat);
  socket.on("serverShutdown", () => onConnection?.("reconnecting"));

  function emit(event, payload, callback) {
    socket.emit(event, payload, (result) => {
      if (result?.ok && result.code && result.token) saveResumeToken(result.code, result.token);
      const safeResult = result?.ok
        ? result
        : { ...result, ok: false, error: friendlyDraftError(result?.error, event === "createSession" ? "create" : event === "joinSession" ? "join" : event) };
      if (!safeResult?.ok) onError?.(safeResult.error);
      callback?.(safeResult);
    });
  }

  return {
    socket,
    create: (nickname, callback) => emit("createSession", { nickname }, callback),
    join: (code, nickname, callback) => emit("joinSession", { code, nickname, token: getResumeToken(code) || undefined }, callback),
    close: () => socket.close(),
  };
}
