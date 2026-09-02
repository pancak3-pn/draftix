import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist-react");
const template = await readFile(path.join(output, "index.html"), "utf8");
const origin = "https://www.draftix.tech";
const image = `${origin}/images/og-1200x630.jpg`;

const pages = [
  {
    path: "/",
    title: "Valorant Map Veto & Agent Draft Tool | Draftix",
    description: "Run Valorant map vetoes, choose starting sides, ban agents, and share match-ready results in one real-time room. Free and no signup required.",
    socialDescription: "Run Valorant map vetoes, side picks, and agent bans together in one real-time room.",
    schema: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Draftix",
      alternateName: "Draftix Valorant Draft Tool",
      url: `${origin}/`,
      description: "A free real-time Valorant map veto and agent draft tool for competitive teams.",
      applicationCategory: "GameApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a modern web browser with JavaScript enabled",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Real-time Valorant map vetoes",
        "Starting-side selection",
        "Agent ban drafting",
        "Shareable match result posters",
        "Rank-based team balancing",
      ],
    },
  },
  {
    path: "/team-balance",
    title: "Valorant Team Balancer by Rank | Draftix",
    description: "Split your Valorant lobby into fair teams using player ranks or a random draw. Compare team ratings and copy the result for Discord.",
    socialDescription: "Build balanced Valorant teams by rank or random draw in seconds.",
  },
  {
    path: "/status",
    title: "Draftix System Status",
    description: "Check the current availability of Draftix rooms, real-time draft synchronization, and Valorant game data.",
    socialDescription: "Current availability of Draftix drafting services.",
  },
  {
    path: "/privacy",
    title: "Privacy Policy | Draftix",
    description: "Read how Draftix handles room nicknames, chat messages, connection metadata, session codes, and service data.",
    socialDescription: "How Draftix handles data used to operate real-time draft rooms.",
  },
  {
    path: "/terms",
    title: "Terms of Service | Draftix",
    description: "Read the terms governing use of the free Draftix Valorant map veto and agent drafting platform.",
    socialDescription: "Terms for using the Draftix Valorant drafting platform.",
  },
  {
    path: "/app",
    title: "Draft Room | Draftix",
    description: "Create or join a private Draftix room for your Valorant map veto and agent draft.",
    socialDescription: "Create or join a private Draftix room.",
    robots: "noindex,nofollow,noarchive",
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function seoBlock(page) {
  const url = `${origin}${page.path === "/" ? "/" : page.path}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const socialDescription = escapeHtml(page.socialDescription);
  const robots = page.robots || "index,follow,max-image-preview:large";
  const brandSchema = `\n    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Draftix","url":"${origin}/","logo":"${origin}/images/draftix.png"}</script>\n    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Draftix","alternateName":"Draftix","url":"${origin}/"}</script>`;
  const schema = page.schema
    ? `\n    <script type="application/ld+json">${JSON.stringify(page.schema).replaceAll("<", "\\u003c")}</script>`
    : "";
  return `<!-- SEO:START -->
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="keywords" content="draftix, valorant draft, valorant map veto, valorant agent ban, map ban tool, valorant team balancer, valorant custom match tool" />
    <meta name="robots" content="${robots}" />
    <meta name="author" content="Draftix" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Draftix" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${socialDescription}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Draftix - real-time Valorant map veto and agent draft tool" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${socialDescription}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="Draftix - real-time Valorant map veto and agent draft tool" />${schema}${brandSchema}
    <!-- SEO:END -->`;
}

for (const page of pages) {
  const html = template.replace(/<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/, seoBlock(page));
  if (page.path === "/") {
    await writeFile(path.join(output, "index.html"), html);
    continue;
  }
  await writeFile(path.join(output, `${page.path.slice(1)}.html`), html);
}

console.log(`Generated SEO HTML for ${pages.length} routes.`);
