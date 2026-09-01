import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const assetRoot = path.join(root, "public", "images", "agents");
const dataRoot = path.join(root, "public", "data");
const endpoint = "https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US";

const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function download(url, destination) {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed ${response.status}: ${url}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return destination;
}

const response = await fetch(endpoint);
if (!response.ok) throw new Error(`Agent catalog request failed: ${response.status}`);
const payload = await response.json();
const playable = (payload.data || []).filter((agent) => agent.uuid && agent.displayName && agent.fullPortrait);

const agents = [];
for (const agent of playable) {
  const slug = slugify(agent.displayName);
  const folder = path.join(assetRoot, slug);
  const abilities = [];

  await download(agent.fullPortrait, path.join(folder, "portrait.png"));
  await download(agent.displayIcon || agent.displayIconSmall, path.join(folder, "icon.png"));
  if (agent.background) await download(agent.background, path.join(folder, "background.png"));
  if (agent.role?.displayIcon) await download(agent.role.displayIcon, path.join(folder, "role.png"));

  for (const [index, ability] of (agent.abilities || []).entries()) {
    const abilitySlug = slugify(ability.slot || ability.displayName || `ability-${index + 1}`);
    const localIcon = ability.displayIcon ? `/images/agents/${slug}/abilities/${abilitySlug}.png` : null;
    if (ability.displayIcon) await download(ability.displayIcon, path.join(folder, "abilities", `${abilitySlug}.png`));
    abilities.push({
      slot: ability.slot,
      name: ability.displayName,
      description: ability.description,
      icon: localIcon,
    });
  }

  agents.push({
    uuid: agent.uuid,
    name: agent.displayName,
    description: agent.description,
    image: `/images/agents/${slug}/portrait.png`,
    icon: `/images/agents/${slug}/icon.png`,
    background: agent.background ? `/images/agents/${slug}/background.png` : null,
    colors: agent.backgroundGradientColors || [],
    role: agent.role ? {
      name: agent.role.displayName,
      description: agent.role.description,
      icon: agent.role.displayIcon ? `/images/agents/${slug}/role.png` : null,
    } : null,
    abilities,
  });
  process.stdout.write(`Synced ${agent.displayName}\n`);
}

agents.sort((a, b) => a.name.localeCompare(b.name));
await mkdir(dataRoot, { recursive: true });
await writeFile(path.join(dataRoot, "valorant-agents.json"), `${JSON.stringify(agents, null, 2)}\n`, "utf8");
process.stdout.write(`Done: ${agents.length} playable agents\n`);
