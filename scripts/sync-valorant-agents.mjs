/**
 * Syncs the playable-agent catalog from valorant-api.com.
 * - Downloads art and converts it to resized WebP (same policy as optimize-images.mjs).
 * - Preserves custom agents (e.g. "miks", "veto") that exist in the local JSON but not in the API.
 * - Idempotent: existing .webp files are reused unless --force is passed.
 * Run from the repo root: node scripts/sync-valorant-agents.mjs
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const force = process.argv.includes("--force");
const root = process.cwd();
const assetRoot = path.join(root, "public", "images", "agents");
const dataRoot = path.join(root, "public", "data");
const catalogPath = path.join(dataRoot, "valorant-agents.json");
const endpoint = "https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US";

const QUALITY = 80;
const WIDTHS = { portrait: 1024, icon: 256, background: 1600, role: 128 };
const ABILITY_WIDTH = 128;

const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function downloadWebp(url, destination, maxWidth) {
  if (!url) return;
  if (existsSync(destination) && !force) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed ${response.status}: ${url}`);
  await mkdir(path.dirname(destination), { recursive: true });
  let image = sharp(Buffer.from(await response.arrayBuffer()));
  if (maxWidth) image = image.resize({ width: maxWidth, withoutEnlargement: true });
  await image.webp({ quality: QUALITY }).toFile(destination);
  // Drop a stale PNG source left over from the pre-WebP version of this script.
  const legacy = destination.replace(/\.webp$/i, ".png");
  if (legacy !== destination && existsSync(legacy)) await rm(legacy);
}

const response = await fetch(endpoint);
if (!response.ok) throw new Error(`Agent catalog request failed: ${response.status}`);
const payload = await response.json();
const playable = (payload.data || []).filter((agent) => agent.uuid && agent.displayName && agent.fullPortrait);

// Preserve custom agents that live only in the local catalog (not in the API).
let custom = [];
if (existsSync(catalogPath)) {
  const existing = JSON.parse(await readFile(catalogPath, "utf8"));
  if (Array.isArray(existing)) {
    const apiUuids = new Set(playable.map((agent) => agent.uuid));
    custom = existing.filter((agent) => agent.uuid && !apiUuids.has(agent.uuid));
    for (const agent of custom) {
      const refs = [agent.image, agent.icon, agent.background, agent.role?.icon, ...(agent.abilities || []).map((a) => a.icon)];
      const missing = refs.filter((ref) => typeof ref === "string" && ref.startsWith("/images/") && !existsSync(path.join(root, "public", ref.slice(1))));
      if (missing.length) {
        process.stderr.write(`WARNING: custom agent "${agent.name}" is missing assets: ${missing.join(", ")}\n`);
      }
    }
  }
}

const agents = [];
for (const agent of playable) {
  const slug = slugify(agent.displayName);
  const folder = path.join(assetRoot, slug);
  const abilities = [];

  await downloadWebp(agent.fullPortrait, path.join(folder, "portrait.webp"), WIDTHS.portrait);
  await downloadWebp(agent.displayIcon || agent.displayIconSmall, path.join(folder, "icon.webp"), WIDTHS.icon);
  if (agent.background) await downloadWebp(agent.background, path.join(folder, "background.webp"), WIDTHS.background);
  if (agent.role?.displayIcon) await downloadWebp(agent.role.displayIcon, path.join(folder, "role.webp"), WIDTHS.role);

  for (const [index, ability] of (agent.abilities || []).entries()) {
    const abilitySlug = slugify(ability.slot || ability.displayName || `ability-${index + 1}`);
    const localIcon = ability.displayIcon ? `/images/agents/${slug}/abilities/${abilitySlug}.webp` : null;
    if (ability.displayIcon) {
      await downloadWebp(ability.displayIcon, path.join(folder, "abilities", `${abilitySlug}.webp`), ABILITY_WIDTH);
    }
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
    image: `/images/agents/${slug}/portrait.webp`,
    icon: `/images/agents/${slug}/icon.webp`,
    background: agent.background ? `/images/agents/${slug}/background.webp` : null,
    colors: agent.backgroundGradientColors || [],
    role: agent.role ? {
      name: agent.role.displayName,
      description: agent.role.description,
      icon: agent.role.displayIcon ? `/images/agents/${slug}/role.webp` : null,
    } : null,
    abilities,
  });
  process.stdout.write(`Synced ${agent.displayName}\n`);
}

agents.push(...custom);
agents.sort((a, b) => a.name.localeCompare(b.name));
await mkdir(dataRoot, { recursive: true });
await writeFile(catalogPath, `${JSON.stringify(agents, null, 2)}\n`, "utf8");
process.stdout.write(`Done: ${agents.length} agents (${playable.length} from API, ${custom.length} custom preserved)\n`);
