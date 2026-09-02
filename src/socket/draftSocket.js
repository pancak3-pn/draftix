import { io } from "socket.io-client";
import { getResumeToken, saveResumeToken } from "../state/draftReducer";
import { createSupabaseDraftClient } from "./supabaseDraftClient";
import { friendlyDraftError } from "./draftErrors";

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
