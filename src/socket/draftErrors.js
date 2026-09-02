export function friendlyDraftError(error, context = "action") {
  const raw = String(error?.message || error || "").trim();
  const normalized = raw.toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (
    code === "rate_limit_exceeded" ||
    error?.status === 429 ||
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("raise sqlstate 'pgrst'")
  ) {
    if (context === "create") return "You’re creating rooms too quickly. Please wait a few minutes and try again.";
    if (context === "join") return "Too many join attempts. Please wait a moment and try again.";
    return "You’re doing that too quickly. Please wait a moment and try again.";
  }

  if (normalized.includes("please wait 10 seconds")) return "Please wait 10 seconds before sending another message.";
  if (normalized.includes("limited to 100 characters")) return "Messages are limited to 100 characters.";
  if (normalized.includes("session not found")) return "That room could not be found. Check the code and try again.";
  if (normalized.includes("room full")) return "That room is currently full.";
  if (normalized.includes("invalid code")) return "Enter a valid room code.";
  if (normalized.includes("authentication required") || normalized.includes("permission denied")) return "Your session expired. Refresh the page and try again.";
  if (normalized.includes("captain taken")) return "That captain position was just claimed by another player.";
  if (normalized.includes("need both captains")) return "Both teams need a captain before the draft can start.";
  if (normalized.includes("not your turn")) return "It is not your team’s turn yet.";
  if (normalized.includes("not your pick")) return "Your team is not choosing right now.";
  if (normalized.includes("host only") || normalized.includes("only host")) return "Only the room host can do that.";
  if (normalized.includes("wrong phase") || normalized.includes("invalid phase")) return "That action is not available during this stage.";
  if (normalized.includes("nothing to undo")) return "There is nothing to undo yet.";
  if (normalized.includes("captains stay")) return "Captains must remain on their assigned team.";
  if (normalized.includes("cannot change team")) return "Teams can no longer be changed during this draft.";
  if (normalized.includes("catalog")) return "Game data is temporarily unavailable. Please try again shortly.";
  if (normalized.includes("logo")) return "That team logo could not be saved. Try another image.";
  if (normalized.includes("bad map") || normalized.includes("bad agent") || normalized.includes("already decided")) return "That selection is no longer available.";
  if (normalized.includes("not a room member") || normalized.includes("not in session") || normalized.includes("bad session")) return "You are no longer connected to this room. Rejoin and try again.";
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed")
  ) return "Connection lost. Check your internet and try again.";

  if (normalized === "empty message") return "Enter a message before sending.";
  if (normalized.includes("pick attack or defense")) return "Choose either attack or defense.";

  return context === "connect"
    ? "Draftix could not connect. Please refresh and try again."
    : "Something went wrong. Please try again.";
}
