export const initialDraftState = { connection: "connecting", session: null, error: "", pending: false };

export function draftReducer(state, action) {
  switch (action.type) {
    case "connection": return { ...state, connection: action.value };
    case "state": return { ...state, session: action.value, error: "", pending: false };
    case "chat": return state.session ? { ...state, session: { ...state.session, chat: [...(state.session.chat || []), action.value].slice(-50) } } : state;
    case "error": return { ...state, error: action.value, pending: false };
    case "pending": return { ...state, pending: action.value, error: "" };
    case "reset": return initialDraftState;
    default: return state;
  }
}

export const sessionCodeFromUrl = () => new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase() || "";

export function getNickname() {
  try { return localStorage.getItem("draftix:nickname") || ""; } catch { return ""; }
}

export function saveNickname(value) {
  try { if (value) localStorage.setItem("draftix:nickname", value); } catch { /* storage may be unavailable */ }
}

const RESUME_TOKEN_PREFIX = "draftix:token:";
// Rooms are garbage-collected server-side within hours of going idle, so a
// week is a generous ceiling for how long a resume token can still work.
const RESUME_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getResumeToken(code) {
  try {
    if (!code) return null;
    const raw = localStorage.getItem(RESUME_TOKEN_PREFIX + code);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.token === "string" ? parsed.token : raw;
    } catch {
      return raw; // Legacy bare-token format from earlier builds.
    }
  } catch { return null; }
}

export function saveResumeToken(code, token) {
  try {
    if (code && token) localStorage.setItem(RESUME_TOKEN_PREFIX + code, JSON.stringify({ token, savedAt: Date.now() }));
  } catch { /* storage may be unavailable */ }
}

// Every host and player join stores a resume token, and without this cleanup
// they accumulate forever — one key per room ever joined on this device, long
// after the rooms themselves expired. Called once at app startup. Legacy
// bare-string tokens are re-stamped in the envelope format instead of
// deleted, so a draft in progress across the update keeps its seat.
export function purgeResumeTokens() {
  try {
    const now = Date.now();
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(RESUME_TOKEN_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let token = "";
      let savedAt = 0;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.token === "string") { token = parsed.token; savedAt = Number(parsed.savedAt) || 0; }
      } catch { /* legacy bare token */ }
      if (token) {
        if (now - savedAt > RESUME_TOKEN_TTL_MS) localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify({ token: raw, savedAt: now }));
      }
    }
  } catch { /* storage may be unavailable */ }
}
