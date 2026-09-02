import SiteHeader from "../components/SiteHeader.jsx";
import PublicFooter from "../components/PublicFooter.jsx";

const privacy = [
  ["What we collect", <ul><li><strong>Nicknames and chat messages</strong> remain in server memory for the lifetime of a session.</li><li><strong>Connection metadata</strong> is used for rate limiting and abuse defense.</li><li><strong>Session codes</strong> are logged to guarantee that each code remains unique. The log contains no chat, picks, nicknames, or IP addresses.</li></ul>],
  ["What we do not collect", <ul><li>No accounts, passwords, or email addresses.</li><li>No analytics scripts, advertising networks, or third-party trackers.</li><li>No persistent match, map, or draft history.</li></ul>],
  ["How long data lives", <p>Sessions and chat live only in server memory. They are removed when the host closes the room or after two hours of inactivity. Anonymous session codes remain on disk to preserve uniqueness.</p>],
  ["Third-party services", <p>Valorant map and agent metadata is requested server-side. Google Fonts provides typography, and Ko-fi processes voluntary donations when users follow that external link.</p>],
  ["Children", <p>DRAFTIX has no age gate and does not require personal information. Use of the service remains subject to local law.</p>],
  ["Contact", <p>Questions or concerns can be sent to <a href="https://mail.google.com/mail/?view=cm&fs=1&to=support%40draftix.tech&su=Draftix%20privacy%20question" target="_blank" rel="noreferrer">support@draftix.tech</a>.</p>],
];

const terms = [
  ["1. The service", <p>DRAFTIX is a free browser-based tool for real-time Valorant map and agent drafts. It is provided as-is without an uptime guarantee or warranty.</p>],
  ["2. Acceptable use", <><p>You agree not to:</p><ul><li>Harass, threaten, or spam other players.</li><li>Post hateful, illegal, or sexually explicit content.</li><li>Overload, scrape, deface, or otherwise abuse the service.</li><li>Resell or repackage DRAFTIX as your own product.</li></ul></>],
  ["3. User content", <p>Nicknames, team names, and chat messages remain in volatile server memory and are removed when the session ends or expires. You retain any rights you hold in that content.</p>],
  ["4. Riot Games and Valorant", <p>DRAFTIX is an independent fan-made tool. It is not affiliated with, endorsed by, or sponsored by Riot Games. Valorant names, artwork, and related marks belong to Riot Games.</p>],
  ["5. Donations", <p>Ko-fi donations are voluntary and non-refundable. They do not purchase features, privileges, or service guarantees.</p>],
  ["6. Disclaimer", <p>DRAFTIX is provided “as is” and “as available.” To the maximum extent permitted by law, its maintainers disclaim implied and statutory warranties.</p>],
  ["7. Limitation of liability", <p>To the maximum extent permitted by law, DRAFTIX and its maintainers are not liable for indirect, incidental, consequential, or punitive damages or loss of session data.</p>],
  ["8. Changes", <p>These terms may be updated. Continued use after an update constitutes acceptance of the revised terms.</p>],
  ["9. Contact", <p>Questions can be sent to <a href="https://mail.google.com/mail/?view=cm&fs=1&to=support%40draftix.tech&su=Draftix%20terms%20question" target="_blank" rel="noreferrer">support@draftix.tech</a>.</p>],
];

const slug = (title) => title.toLowerCase().replace(/^\d+\.\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const cleanTitle = (title) => title.replace(/^\d+\.\s*/, "");

export default function LegalPage({ type }) {
  const isPrivacy = type === "privacy";
  const sections = isPrivacy ? privacy : terms;

  return <main className="sp-page legal-sp-page">
    <SiteHeader />
    <div className="legal-shell">
      <header className="legal-hero">
        <span>Draftix legal</span>
        <h1>{isPrivacy ? "Privacy policy" : "Terms of service"}</h1>
        <p className="legal-updated">Effective May 12, 2026</p>
        <p className="legal-lead">{isPrivacy ? "DRAFTIX is a free, no-signup draft tool. This policy explains the limited data used to operate it." : "By using DRAFTIX, you agree to these plain-language service terms."}</p>
      </header>

      <div className="legal-layout">
        <aside className="legal-toc">
          <span>On this page</span>
          <nav aria-label={`${isPrivacy ? "Privacy policy" : "Terms of service"} sections`}>
            {sections.map(([title], index) => <a href={`#${slug(title)}`} key={title}><i>{String(index + 1).padStart(2, "0")}</i>{cleanTitle(title)}</a>)}
          </nav>
        </aside>

        <article className="legal-document">
          {sections.map(([title, body], index) => <section id={slug(title)} key={title}>
            <div className="legal-section-title"><span>{String(index + 1).padStart(2, "0")}</span><h2>{cleanTitle(title)}</h2></div>
            <div className="legal-section-copy">{body}</div>
          </section>)}
        </article>
      </div>
    </div>
    <PublicFooter />
  </main>;
}
