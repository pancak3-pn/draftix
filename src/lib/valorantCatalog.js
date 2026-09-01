const MAP_POOL = ["Ascent","Abyss","Bind","Breeze","Fracture","Haven","Icebox","Lotus","Pearl","Split","Sunset"];
const CACHE_KEY = "draftix:catalog:v2";
const CACHE_TTL = 12 * 60 * 60 * 1000;

function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return value?.catalog?.maps?.length > 1 && value?.catalog?.agents?.length > 1 ? value : null;
  } catch { return null; }
}

export async function getValorantCatalog() {
  const cached = readCache();
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached.catalog;
  try {
    const [agentsResponse, mapsResponse] = await Promise.all([
      fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US"),
      fetch("https://valorant-api.com/v1/maps?language=en-US"),
    ]);
    if (!agentsResponse.ok || !mapsResponse.ok) throw new Error("Valorant catalog request failed");
    const [agentsJson, mapsJson] = await Promise.all([agentsResponse.json(), mapsResponse.json()]);
    const agents = (agentsJson.data || [])
      .filter((agent) => agent.uuid && agent.displayName && agent.fullPortrait)
      .map((agent) => ({ uuid: agent.uuid, name: agent.displayName, image: agent.fullPortrait, icon: agent.displayIcon || agent.fullPortrait }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const maps = (mapsJson.data || [])
      .filter((map) => MAP_POOL.includes(map.displayName))
      .map((map) => ({ uuid: map.uuid, name: map.displayName, image: `/images/maps/${map.displayName.toLowerCase()}.png` }))
      .sort((a, b) => MAP_POOL.indexOf(a.name) - MAP_POOL.indexOf(b.name));
    if (maps.length < 2 || agents.length < 2) throw new Error("Valorant catalog is incomplete");
    const catalog = { maps, agents };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), catalog })); } catch {}
    return catalog;
  } catch (error) {
    if (cached) return cached.catalog;
    throw error;
  }
}
