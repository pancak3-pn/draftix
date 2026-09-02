import { AppBrand } from "./AppNav.jsx";

export default function PublicFooter({ reveal = false }) {
  return <footer className={`dr-footer public-footer${reveal ? "" : " is-visible"}`} {...(reveal ? { "data-reveal": true } : {})}>
    <AppBrand className="dr-brand" />
    <p>Real-time drafting for Valorant teams.</p>
    <nav aria-label="Footer navigation">
      <a href="/status.html">Status</a>
      <a href="/privacy.html">Privacy</a>
      <a href="/terms.html">Terms</a>
    </nav>
    <small>© {new Date().getFullYear()} DRAFTIX</small>
  </footer>;
}
