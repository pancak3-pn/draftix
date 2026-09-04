# Draftix — Full Re-Audit Findings

**Date:** 2026-09-04
**Scope:** backend security, Supabase SQL layer, frontend architecture, heavy components, SEO/meta/headers, UX/accessibility.
**Context:** fresh ranked pass after the quick-wins bundle (footer poll 10s→30s, truthful map-pool count, resume-token TTL purge) and repo hygiene (deleted build.log and the dangerous RUN_THIS_rate_limit_update.sql).

## Verdict

The codebase is in strong shape — the earlier audit bundles fixed the major issues. This pass surfaces **2 security items worth fixing soon**, **4 performance/UX improvements**, and **2 minor notes**. Everything else checked out clean.

## Ranked findings

| Rank | Severity | Area | Finding | Effort |
|---|---|---|---|---|
| 1 | High | Security/Perf | `rpc/draftix_room_state` + `rpc/draftix_tournament_state` missing from the rate-limit hook | Small SQL migration |
| 2 | Medium-High | Deployment | `CHANGE_ME` placeholder admin token in analytics.sql | Small SQL guard |
| 3 | Medium | Perf | All 8 stylesheets eagerly imported in the entry chunk | Small refactor |
| 4 | Medium | Perf | Six `preload="auto"` Audio objects on DraftBoard mount | Tiny |
| 5 | Low-Medium | Perf | 250ms tick re-renders the entire DraftBoard | Small refactor |
| 6 | Low-Medium | UX | Chat log doesn't auto-scroll on new messages | Tiny |
| 7 | Low | Perf | Full catalog in every state broadcast (intentional) | Optional / none |
| 8 | Low | SEO/Ops | Verification-token placeholders; HSTS without preload | Notes only |

---

### 1. Rate-limit gap: the two state RPCs are unbounded — High (security/performance)

**Evidence:** every later migration re-applies the complete `draftix_check_request` PostgREST pre-request hook, so the final effective case list lives in [202609040004_client_errors.sql](../supabase/migrations/202609040004_client_errors.sql:150). It covers create_room, join_room, admin_stats/feedback/errors, report_client_error, submit_feedback, presence, heartbeat, visitor_heartbeat, visitor_leave, site_pageviews, and the action group — but **not** `rpc/draftix_room_state` or `rpc/draftix_tournament_state`.

**Impact:**

- `draftix_room_state` (authenticated) returns the full session state including the complete agent/map catalog, and the client refetches it on every realtime event ([supabaseDraftClient.js](../src/socket/supabaseDraftClient.js:50) `refresh()` / `scheduleRefresh()`).
- `draftix_tournament_state` is granted to **anon** and aggregates the whole bracket plus standings.
- Both can be hammered in tight loops with no 429 — the cheapest DoS-amplification surface left on the site.

**Fix sketch:** new migration (e.g. `202609050001_rate_limit_state_rpcs.sql`) that re-applies the hook following the established pattern, adding two cases. Suggested limits: `draftix_room_state` 120/min per identity (it fires on every realtime event, so it needs headroom), `draftix_tournament_state` 60/min (anon-accessible, tighter). Keep the 2% opportunistic cleanup, revoke/grant cycle, and the `alter role authenticator set pgrst.db_pre_request` re-application.

### 2. `CHANGE_ME` placeholder admin token in analytics.sql — Medium-High (deployment)

**Evidence:** [analytics.sql](../supabase/analytics.sql) ships with a `CHANGE_ME` placeholder for the admin token.

**Impact:** if applied as-is in production, the admin token is a publicly-known value — the admin_stats/feedback/errors RPCs that check it become readable by anyone who reads the repo.

**Fix sketch:** make the admin RPCs fail closed while the token is still the placeholder (e.g. `if v_admin_token = 'CHANGE_ME' then raise exception ...`), so a forgotten rotation can't silently expose data. Also confirm DEPLOY.md explicitly calls out replacing it before applying.

### 3. All 8 stylesheets eagerly imported in main.jsx — Medium (performance)

**Evidence:** [main.jsx](../src/main.jsx:1) imports fonts, tokens, base, landing-redesign, app-redesign (~4,700 lines), support-pages, typography, and tournaments CSS into the entry chunk. Only [admin.css](../src/styles/admin.css) is properly code-split (imported by the lazy AdminPage).

**Impact:** render-blocking CSS on first paint; landing visitors download draft-board and tournament styles they may never use. This partially undercuts the excellent lazy-route splitting in [App.jsx](../src/App.jsx:1).

**Fix sketch:** move per-route CSS into the lazy components — Vite code-splits CSS alongside dynamic imports. Keep fonts/tokens/base in the entry (needed for the shell). Concretely: `landing-redesign.css` → LandingPage, `app-redesign.css` → SessionGate/DraftBoard, `tournaments.css` → TournamentPage, `support-pages.css` → support pages; `typography.css` may need to stay in the entry if the shared nav depends on it. Verify no FOUC — the RouteFallback must still be styled.

### 4. Six Audio objects with `preload="auto"` on DraftBoard mount — Medium (performance)

**Evidence:** [DraftBoard.jsx](../src/components/DraftBoard.jsx:658) creates six `Audio` objects (bg-music loop, choose-agent, choose-agent-selection, agent-banned, choose-your-side, match-found) with `preload="auto"`.

**Impact:** all six MP3s download on mount even if the user never enables sound — several MB competing with agent portraits for bandwidth during the most latency-sensitive moment (draft start), worst on mobile data.

**Fix sketch:** switch to `preload="none"` (the existing autoplay-retry on pointerdown/keydown already handles gesture-gated loading) or `preload="metadata"`. One-line change per object; keep the cleanup logic as-is.

### 5. 250ms tick re-renders the entire DraftBoard — Low-Medium (performance)

**Evidence:** the turn timer at [DraftBoard.jsx](../src/components/DraftBoard.jsx:511) runs `setInterval(tick, 250)` and updates state 4×/s, re-rendering the full board tree (agent grids, ban console, chat).

**Impact:** wasted renders on a large tree — fine on desktop, noticeable on low-end mobile during drafts.

**Fix sketch:** extract the countdown into a small `TurnCountdown` component that owns the 250ms interval, so the parent only re-renders on real state changes. The timer already only matters for the active team's UI, so the blast radius shrinks to one small subtree.

### 6. Chat log doesn't auto-scroll on new messages — Low-Medium (UX)

**Evidence:** the `.dx-chat-log` in [DraftBoard.jsx](../src/components/DraftBoard.jsx:986) renders messages but never scrolls; a repo-wide search confirmed only TeamBalancerPage uses `scrollIntoView` anywhere.

**Impact:** during active drafts, new chat/pick messages arrive off-screen — users must manually scroll, and pick announcements can be missed entirely.

**Fix sketch:** `useEffect` on message count → `el.scrollTo({ top: el.scrollHeight })`, but only when the user is already near the bottom (within ~40px) so manual scrolling up isn't fought.

### 7. Full catalog in every state broadcast — Low (performance, intentional)

**Evidence:** [sessionView](../server.js:501) embeds the full agent/map catalog in every broadcast; the Supabase path does the same via the `draftix_room_state` refetch-on-event.

**Impact:** bandwidth-heavy (25+ agents with portrait URLs × every event × every spectator), but it's an intentional stateless-client design and works. This is the known scaling boundary noted in DEPLOY.md.

**Status:** no action now. First lever to pull if egress becomes a problem: catalog versioning (send `catalogVersion`, client caches by version).

### 8. Minor SEO/ops notes — Low

- [index.html](../index.html) has commented-out `google-site-verification` / Bing token placeholders — fill them in when claiming Search Console / Bing Webmaster. Placeholders, not defects.
- [vercel.json](../vercel.json:8) HSTS is `max-age=31536000; includeSubDomains` without `preload` — fine as-is; only add `preload` if you intend to submit to the HSTS preload list (hard to reverse).

---

## Verified strong — no action needed

- **Backend** ([server.js](../server.js)): helmet CSP, CORS allowlist, http/admin/img rate limiters, socket token binding + alias/evict logic, graceful shutdown, session GC, admin gating, Discord webhook URL validation.
- **SQL layer**: RLS on all tables, security-definer RPCs with token checks, row locks, revoke-by-default grants, advisory-lock rate limiting with 429 + Retry-After, tournament engines (single/double elimination with bye propagation, round robin, Swiss with rematch avoidance), fail-safe realtime broadcast triggers.
- **Frontend architecture**: lazy routes + Suspense, soft-404 title prevention, clean custom router, error boundary + global error handlers, resume-token purge.
- **Components**: aria-pressed/aria-live, role=status, keyboard handlers, canvas poster generation, client-side logo resize with object-URL cleanup, full audio cleanup on unmount.
- **SEO**: complete meta/OG/Twitter/JSON-LD @graph, CSP + security headers, tiered cache-control, robots with social-crawler allowances, 10-URL sitemap, prerendered SEO pages verified at build time.
- **Accessibility**: 27 `prefers-reduced-motion` blocks across all stylesheets, 67 `focus-visible` rules with visible accent outlines, skip link in admin.

## Recommended next bundles

1. **Security bundle (first):** findings 1 + 2 — one rate-limit migration + one fail-closed guard.
2. **Perf bundle:** findings 3 + 4 (+ 5 if appetite) — CSS code-splitting + audio preload.
3. **UX bundle:** finding 6 — chat auto-scroll.
