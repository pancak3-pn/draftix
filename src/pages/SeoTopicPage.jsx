import SiteHeader from "../components/SiteHeader.jsx";
import PublicFooter from "../components/PublicFooter.jsx";

const TOPICS = {
  "/valorant-map-veto": {
    label: "Draftix guide",
    title: "Valorant map veto.",
    lead: "Ban maps, choose a side, and keep both captains on the same screen.",
    intro: "Draftix gives both teams one shared room for a scrim or tournament map veto. Every confirmed ban appears live, with no spreadsheet or chat log to manage.",
    image: "/images/Homepage/step2-banmap.png",
    imageAlt: "Draftix map veto screen showing available Valorant maps",
    steps: [
      "Create a room and choose the competitive preset.",
      "Share the code and assign both captains.",
      "Ban maps, select the final map, and confirm sides.",
    ],
    faq: [
      ["Do players need an account?", "No. Everyone joins with the same room code."],
      ["Does the veto update live?", "Yes. Connected players see each confirmed choice immediately."],
      ["Can Draftix run tournament map bans?", "Yes. Hosts can set the format, invite both captains, and record the final map and starting side."],
    ],
  },
  "/valorant-agent-ban": {
    label: "Draftix guide",
    title: "Valorant agent bans.",
    lead: "Set the ban count, follow captain turns, and record every decision live.",
    intro: "Draftix keeps the agent pool and turn order visible to both teams. The host sets the rules once, then each captain completes their ban in sequence.",
    image: "/images/Homepage/step4-banagent.png",
    imageAlt: "Draftix agent ban screen with Valorant agent choices",
    steps: [
      "Enable agent bans in the room settings.",
      "Choose the ban limit and lock both captains.",
      "Complete each turn and save the final matchup.",
    ],
    faq: [
      ["Can the host choose the ban count?", "Yes. The limit is configured before the draft starts."],
      ["Can both teams follow the bans?", "Yes. The room stays synchronized for every connected player."],
    ],
  },
  "/valorant-draft-tool": {
    label: "Draftix guide",
    title: "Valorant draft tool.",
    lead: "Handle maps, sides, agent bans, and the final matchup in one flow.",
    intro: "Draftix replaces scattered messages with a focused pre-match room. It works for scrims, custom matches, and community tournaments without requiring signup.",
    image: "/images/Homepage/matchfound.png",
    imageAlt: "Draftix match result showing the selected Valorant map and team sides",
    steps: [
      "Choose a format and set the draft rules.",
      "Invite the teams and assign captains.",
      "Finish the draft and share the match result.",
    ],
    faq: [
      ["What does Draftix include?", "Map vetoes, side selection, agent bans, and a final match result."],
      ["Is Draftix free?", "Yes. You can create a room without an account."],
    ],
  },
};

export default function SeoTopicPage({ path }) {
  const topic = TOPICS[path] || TOPICS["/valorant-draft-tool"];

  return (
    <main className="sp-page seo-topic-page">
      <SiteHeader />
      <article className="seo-topic-shell">
        <header className="seo-topic-hero">
          <p className="seo-topic-label">{topic.label}</p>
          <h1>{topic.title}</h1>
          <p className="seo-topic-lead">{topic.lead}</p>
          <a href="/draft">Open a draft room</a>
        </header>

        <figure className="seo-topic-visual">
          <img src={topic.image} alt={topic.imageAlt} />
        </figure>

        <div className="seo-topic-article">
          <section aria-labelledby="topic-overview">
            <h2 id="topic-overview">A simpler pre-match process</h2>
            <p>{topic.intro}</p>
          </section>

          <section aria-labelledby="topic-steps">
            <h2 id="topic-steps">How it works</h2>
            <ol className="seo-topic-steps">
              {topic.steps.map((step, index) => (
                <li key={step}><span>{index + 1}</span>{step}</li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="topic-questions">
            <h2 id="topic-questions">Good to know</h2>
            <div className="seo-topic-faq">
              {topic.faq.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>

          <nav className="seo-topic-related" aria-label="Related Valorant tools">
            <a href="/valorant-map-veto">Map veto</a>
            <a href="/valorant-agent-ban">Agent bans</a>
            <a href="/valorant-draft-tool">Draft tool</a>
            <a href="/team-balance">Team balancer</a>
          </nav>

          <p className="seo-topic-disclaimer">Draftix is an independent community tool and is not endorsed by Riot Games.</p>
        </div>
      </article>
      <PublicFooter />
    </main>
  );
}
