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

export function getResumeToken(code) {
  try { return code ? localStorage.getItem(`draftix:token:${code}`) : null; } catch { return null; }
}

export function saveResumeToken(code, token) {
  try { if (code && token) localStorage.setItem(`draftix:token:${code}`, token); } catch { /* storage may be unavailable */ }
}
