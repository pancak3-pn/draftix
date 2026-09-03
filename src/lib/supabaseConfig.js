/**
 * Shared Supabase browser configuration. Reads the public (publishable)
 * credentials from Vite env vars; returns null when the deployment does
 * not use the Supabase backend (e.g. the Express/Socket.IO fallback), so
 * callers can skip Supabase-only features cleanly.
 */
export function supabaseConfig() {
  const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}
