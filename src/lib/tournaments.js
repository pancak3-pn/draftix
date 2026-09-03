import { createClient } from "@supabase/supabase-js";

const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 10 } },
}) : null;

function friendlyTournamentError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("not found")) return "This tournament link is unavailable.";
  if (message.includes("organizer access")) return "The organizer link is invalid or has expired.";
  if (message.includes("next match")) return "Clear the later match result before changing this winner.";
  if (message.includes("final series")) return "Enter the final series score (e.g. 3–1 in a best of 5). Partial scores can't be saved.";
  if (message.includes("clear later swiss")) return "Clear the later Swiss rounds before changing this result.";
          if (message.includes("not ready")) return "Both teams must be decided before recording this match.";
  if (message.includes("already decided")) return "This match is already decided. Clear it first.";
  if (message.includes("valid live score")) return "Enter a valid live score (within the match format).";
  if (message.includes("non-tied score") || message.includes("higher score")) return "The selected winner must have the higher score.";
  if (message.includes("unique")) return "Every team needs a unique name.";
  if (message.includes("too many") || message.includes("rate limit")) return "Too many attempts. Please wait and try again.";
  if (message.includes("daily tournament limit")) return "You've reached today's tournament limit — try again tomorrow.";
  if (message.includes("failed to fetch") || message.includes("network")) return "Could not reach Draftix. Check your connection and try again.";
  if (message.includes("authentication")) return "Your session expired. Refresh the page and try again.";
  return "Something went wrong. Please try again.";
}

async function ensureAuth() {
  if (!supabase) throw new Error("Draftix is not configured");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw result.error;
  }
}

async function rpc(name, params, auth = false) {
  try {
    if (!supabase) throw new Error("Draftix is not configured");
    if (auth) await ensureAuth();
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(friendlyTournamentError(error));
  }
}

export function tournamentToken(slug) {
  return sessionStorage.getItem(`draftix:tournament:${slug}`) || "";
}

export function saveTournamentToken(slug, token) {
  if (slug && token) sessionStorage.setItem(`draftix:tournament:${slug}`, token);
}

export const createTournament = (name, teams, bestOf, format = "single_elimination") =>
  rpc("draftix_create_tournament", { p_name: name, p_teams: teams, p_best_of: bestOf, p_format: format }, true);

export const getTournament = (slug, token = "") =>
  rpc("draftix_tournament_state", { p_slug: slug, p_token: token || null });

export const setMatchResult = (slug, token, matchId, scoreA, scoreB, winnerTeamId) =>
  rpc("draftix_set_match_result", { p_slug: slug, p_token: token, p_match_id: matchId, p_score_a: scoreA, p_score_b: scoreB, p_winner_team_id: winnerTeamId }, true);

export const clearMatchResult = (slug, token, matchId) =>
  rpc("draftix_clear_match_result", { p_slug: slug, p_token: token, p_match_id: matchId }, true);

export const updateSeriesScore = (slug, token, matchId, scoreA, scoreB) =>
  rpc("draftix_update_series_score", { p_slug: slug, p_token: token, p_match_id: matchId, p_score_a: scoreA, p_score_b: scoreB }, true);

export function subscribeToTournament(tournamentId, onChange) {
  if (!tournamentId) return () => {};
  const timer = window.setInterval(onChange, 5000);
  return () => window.clearInterval(timer);
}
