import { io } from "socket.io-client";
import { getResumeToken, saveResumeToken } from "../state/draftReducer";

export function createDraftSocket({ onState, onChat, onConnection, onError }) {
  const socket = io({ transports: ["websocket", "polling"] });
  socket.on("connect", () => onConnection?.("online"));
  socket.on("disconnect", () => onConnection?.("offline"));
  socket.on("connect_error", () => onConnection?.("offline"));
  socket.on("state", onState);
  socket.on("chat", onChat);
  socket.on("serverShutdown", () => onConnection?.("reconnecting"));

  function emit(event, payload, callback) {
    socket.emit(event, payload, (result) => {
      if (result?.ok && result.code && result.token) saveResumeToken(result.code, result.token);
      if (!result?.ok) onError?.(result?.error || "The server rejected that action.");
      callback?.(result);
    });
  }

  return {
    socket,
    create: (nickname, callback) => emit("createSession", { nickname }, callback),
    join: (code, nickname, callback) => emit("joinSession", { code, nickname, token: getResumeToken(code) || undefined }, callback),
    close: () => socket.close(),
  };
}
