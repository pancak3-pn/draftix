import { AppBrand } from "./AppNav.jsx";

export default function PublicFooter({ reveal = false }) {
  return <footer className={`dr-footer public-footer${reveal ? "" : " is-visible"}`} {...(reveal ? { "data-reveal": true } : {})}>
    <AppBrand className="dr-brand" />
    <p>Real-time drafting for Valorant teams.</p>
    <nav aria-label="Footer navigation">
      <a href="/status">Status</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a className="public-footer-contact" href="https://mail.google.com/mail/?view=cm&fs=1&to=support%40draftix.tech" target="_blank" rel="noreferrer">support@draftix.tech</a>
      <a className="public-footer-donate" href="https://ko-fi.com/dartzski" target="_blank" rel="noreferrer" aria-label="Clutch the server bill on Ko-fi">Clutch the server bill</a>
    </nav>
    <small>© {new Date().getFullYear()} DRAFTIX</small>
  </footer>;
}
