import SiteHeader from "../components/SiteHeader.jsx";

const privacy = [
  ["What we collect", <ul><li><strong>Nicknames and chat messages</strong> remain in server memory for the lifetime of a session.</li><li><strong>Connection metadata</strong> is used for rate limiting and abuse defense.</li><li><strong>Session codes</strong> are logged to guarantee that each code remains unique. The log contains no chat, picks, nicknames, or IP addresses.</li></ul>],
  ["What we do not collect", <ul><li>No accounts, passwords, or email addresses.</li><li>No analytics scripts, advertising networks, or third-party trackers.</li><li>No persistent match, map, or draft history.</li></ul>],
  ["How long data lives", <p>Sessions and chat live only in server memory. They are removed when the host closes the room or after two hours of inactivity. Anonymous session codes remain on disk to preserve uniqueness.</p>],
  ["Third-party services", <p>Valorant map and agent metadata is requested server-side. Google Fonts provides typography, and Ko-fi processes voluntary donations when users follow that external link.</p>],
  ["Children", <p>DRAFTIX has no age gate and does not require personal information. Use of the service remains subject to local law.</p>],
  ["Contact", <p>Questions or concerns can be sent through <a href="https://ko-fi.com/dartzski" target="_blank" rel="noreferrer">Ko-fi</a>.</p>],
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
  ["9. Contact", <p>Questions can be sent through <a href="https://ko-fi.com/dartzski" target="_blank" rel="noreferrer">Ko-fi</a>.</p>],
];

export default function LegalPage({ type }) {
  const isPrivacy = type === "privacy";
  return <main className="sp-page"><SiteHeader /><article className="legal-page"><header><h1>{isPrivacy ? "Privacy policy" : "Terms of service"}</h1><p>Last updated May 12, 2026</p></header><p className="legal-lead">{isPrivacy ? "DRAFTIX is a free, no-signup draft tool. This policy explains the limited data used to operate it." : "By using DRAFTIX, you agree to these plain-language service terms."}</p>{(isPrivacy ? privacy : terms).map(([title, body]) => <section key={title}><h2>{title}</h2>{body}</section>)}</article><footer className="sp-footer"><a href="/">Home</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></footer></main>;
}
