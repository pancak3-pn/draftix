import { AppBrand } from "./AppNav.jsx";

export default function PublicFooter({ reveal = false }) {
  return (
    <footer className={`dr-footer public-footer${reveal ? "" : " is-visible"}`} {...(reveal ? { "data-reveal": true } : {})}>
      <div className="public-footer-main">
        <div className="public-footer-brand">
          <AppBrand className="dr-brand" />
          <p>Real-time drafting for Valorant teams.</p>
        </div>

        <nav className="public-footer-primary" aria-label="Draftix tools">
          <a href="/draft">Open Draftix</a>
          <a href="/team-balance">Team balancer</a>
          <a href="/valorant-draft-tool">Draft guide</a>
        </nav>
      </div>

      <div className="public-footer-utility">
        <small>{"©"} {new Date().getFullYear()} DRAFTIX</small>
        <nav aria-label="Footer information">
          <a href="/status">Status</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a className="public-footer-contact" href="https://mail.google.com/mail/?view=cm&fs=1&to=support%40draftix.tech" target="_blank" rel="noreferrer">Email support</a>
          <a className="public-footer-donate" href="https://ko-fi.com/dartzski" target="_blank" rel="noreferrer" aria-label="Clutch the server bill on Ko-fi">Clutch the server bill</a>
        </nav>
      </div>
    </footer>
  );
}
