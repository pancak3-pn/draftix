const fs = require("node:fs");
const path = require("node:path");

const output = path.resolve(__dirname, "..", "dist-react");
const files = fs.readdirSync(output).filter((file) => file.endsWith(".html"));
let schemaCount = 0;
const canonicals = new Set();

for (const file of files) {
  const html = fs.readFileSync(path.join(output, file), "utf8");
  const scripts = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  for (const script of scripts) {
    JSON.parse(script[1]);
    schemaCount += 1;
  }
  if (!/<title>[^<]+<\/title>/.test(html)) throw new Error(`Missing title: ${file}`);
  if (!/<meta name="description" content="[^\"]+" \/>/.test(html)) throw new Error(`Missing description: ${file}`);
  if (!/<meta name="robots" content="[^\"]+" \/>/.test(html)) throw new Error(`Missing robots directive: ${file}`);
  const canonical = html.match(/<link rel="canonical" href="(https:\/\/www\.draftix\.tech\/[^\"]*)" \/>/)?.[1];
  if (!canonical) throw new Error(`Missing canonical URL: ${file}`);
  if (canonicals.has(canonical)) throw new Error(`Duplicate canonical URL: ${canonical}`);
  canonicals.add(canonical);
}

const homepage = fs.readFileSync(path.join(output, "index.html"), "utf8");
for (const entity of ["#organization", "#website", "#application"]) {
  if (!homepage.includes(entity)) throw new Error(`Homepage schema is missing ${entity}`);
}

console.log(`PASS SEO HTML: ${files.length} unique canonical pages, ${schemaCount} valid JSON-LD blocks`);
