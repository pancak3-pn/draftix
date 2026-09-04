// Minimal client-side router: intercepts clicks on same-origin <a href>
// links, pushes the URL into history, and notifies subscribers so the app
// re-renders without a full page reload. Back/forward buttons work via
// popstate. This keeps the SPA snappy while leaving real URLs intact for
// crawlers, sharing, and hard refreshes.

const listeners = new Set();
let installed = false;

function notify() {
    for (const listener of listeners) listener();
}

/** Programmatic SPA navigation (mirrors clicking an internal link). */
export function navigate(to, { replace = false } = {}) {
    const target = new URL(to, window.location.href);
    if (target.origin !== window.location.origin) {
        // Different origin: fall back to a real navigation.
        if (replace) window.location.replace(target.href);
        else window.location.assign(target.href);
        return;
    }
    if (replace) window.history.replaceState({}, "", target.href);
    else window.history.pushState({}, "", target.href);
    notify();
}

function shouldIntercept(anchor, event) {
    if (event.defaultPrevented) return false; // a component already handled it
    if (event.button !== 0) return false; // middle/right click
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== "_self") return false; // e.g. _blank
    if (anchor.hasAttribute("download")) return false;
    const href = anchor.getAttribute("href");
    if (!href) return false;
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("sms:")) return false;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    // Pure hash links (e.g. "#process") stay with the browser default so the
    // anchor scroll behavior keeps working; also skip links that only change
    // the hash on the current page.
    if (!href.startsWith("#") && url.pathname === window.location.pathname && url.hash) return false;
    if (href.startsWith("#")) return false;
    return true;
}

function onClick(event) {
    if (event.defaultPrevented) return;
    const anchor = event.target.closest("a");
    if (!anchor) return;
    if (!shouldIntercept(anchor, event)) return;
    event.preventDefault();
    const href = anchor.getAttribute("href");
    const url = new URL(href, window.location.href);
    // Same URL with no hash: just scroll to top (matches pushState-router UX).
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
        window.scrollTo({ top: 0 });
        return;
    }
    navigate(href);
}

function onPopState() {
    notify();
}

/** Wire up the global listeners once; subscribe returns an unsubscribe fn. */
export function subscribeToNavigation(notifyPathChange) {
    if (!installed) {
        installed = true;
        // Capture phase: run before any component-level onClick handlers so
        // menu toggles and stopPropagation calls can't shadow the navigation.
        document.addEventListener("click", onClick, true);
        window.addEventListener("popstate", onPopState);
    }
    listeners.add(notifyPathChange);
    return () => listeners.delete(notifyPathChange);
}

/** Current pathname + search, with trailing slash normalized (matches App.jsx). */
export function currentLocation() {
    return {
        path: window.location.pathname.replace(/\/$/, "") || "/",
        search: window.location.search,
    };
}
