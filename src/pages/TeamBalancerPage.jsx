import { useMemo, useState } from "react";
import SiteHeader from "../components/SiteHeader.jsx";

const RANKS = ["Iron 1","Iron 2","Iron 3","Bronze 1","Bronze 2","Bronze 3","Silver 1","Silver 2","Silver 3","Gold 1","Gold 2","Gold 3","Unranked","Platinum 1","Platinum 2","Platinum 3","Diamond 1","Diamond 2","Diamond 3","Ascendant 1","Ascendant 2","Ascendant 3","Immortal 1","Immortal 2","Immortal 3","Radiant"];
const newPlayer = (id) => ({ id, name: "", mmr: 12 });
const total = (team) => team.reduce((sum, player) => sum + player.mmr, 0);

function snakeSplit(players) {
  const teamA = [], teamB = [];
  players.forEach((player, index) => ([0, 3].includes(index % 4) ? teamA : teamB).push(player));
  return { teamA, teamB };
}

function shuffle(players) {
  const result = [...players];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function balance(players, perTeam, strategy) {
  const capacity = perTeam * 2;
  if (strategy === "random") {
    const mixed = shuffle(players);
    if (mixed.length <= capacity) {
      const splitAt = Math.ceil(mixed.length / 2);
      return { teamA: mixed.slice(0, splitAt), teamB: mixed.slice(splitAt), bench: [], strategy };
    }
    return { ...snakeSplit(mixed.slice(0, capacity).sort((a, b) => b.mmr - a.mmr)), bench: mixed.slice(capacity), strategy };
  }
  const sorted = [...players].sort((a, b) => b.mmr - a.mmr);
  return { ...snakeSplit(sorted.slice(0, capacity)), bench: sorted.slice(capacity), strategy };
}

function Team({ name, players, side }) {
  return <section className={`tb-team is-${side}`}><header><div><h3>{name}</h3><p>{players.length ? `Average ${(total(players) / players.length).toFixed(1)} | Total ${total(players)}` : "No players"}</p></div><strong>{players.length}</strong></header><ol>{players.map((player) => <li key={player.id}><span><b>{player.name}</b><small>{RANKS[player.mmr]}</small></span><em>{player.mmr}</em></li>)}</ol></section>;
}

export default function TeamBalancerPage() {
  const [players, setPlayers] = useState(() => Array.from({ length: 10 }, (_, index) => newPlayer(index + 1)));
  const [perTeam, setPerTeam] = useState(5);
  const [strategy, setStrategy] = useState("rank");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const named = useMemo(() => players.filter((player) => player.name.trim()).map((player) => ({ ...player, name: player.name.trim() })), [players]);

  const update = (id, field, value) => setPlayers((current) => current.map((player) => player.id === id ? { ...player, [field]: field === "mmr" ? Number(value) : value } : player));
  const run = () => {
    if (named.length < 2) { setError("Add at least two named players."); setResult(null); return; }
    setError(""); setResult(balance(named, perTeam, strategy));
  };
  const copy = async () => {
    if (!result) return;
    const lines = [`DRAFTIX ${perTeam}v${perTeam}`, "", "Team A", ...result.teamA.map((p) => `${p.name} (${RANKS[p.mmr]})`), "", "Team B", ...result.teamB.map((p) => `${p.name} (${RANKS[p.mmr]})`)];
    if (result.bench.length) lines.push("", "Bench", ...result.bench.map((p) => `${p.name} (${RANKS[p.mmr]})`));
    await navigator.clipboard?.writeText(lines.join("\n"));
  };

  return <main className="sp-page"><SiteHeader /><section className="sp-intro"><h1>Build fair teams.</h1><p>Add the lobby, choose a format, and split players by rank or at random.</p></section><div className="tb-layout"><aside className="tb-controls"><section><h2>Lobby size</h2><div className="tb-options">{[2,3,4,5].map((size) => <button className={perTeam === size ? "is-active" : ""} key={size} onClick={() => setPerTeam(size)}>{size}v{size}</button>)}</div></section><section><h2>Split method</h2><div className="tb-options">{[["rank","By rank"],["random","Random"]].map(([value,label]) => <button className={strategy === value ? "is-active" : ""} key={value} onClick={() => setStrategy(value)}>{label}</button>)}</div><p>{strategy === "rank" ? "Highest-rated starters are snake drafted for close totals." : "The lobby is shuffled before teams are formed."}</p></section><button className="tb-run" onClick={run}>Split teams</button>{error && <p className="tb-error">{error}</p>}</aside><section className="tb-roster"><header><div><h2>Players</h2><p>{named.length} named | {players.length} rows</p></div><button onClick={() => setPlayers((current) => [...current, newPlayer(Date.now())])}>Add player</button></header><div className="tb-rows">{players.map((player, index) => <div className="tb-row" key={player.id}><span>{String(index + 1).padStart(2,"0")}</span><input value={player.name} maxLength="32" placeholder="Player name" aria-label={`Player ${index + 1} name`} onChange={(event) => update(player.id,"name",event.target.value)} /><select value={player.mmr} aria-label={`Player ${index + 1} rank`} onChange={(event) => update(player.id,"mmr",event.target.value)}>{RANKS.map((rank, mmr) => <option value={mmr} key={rank}>{rank}</option>)}</select><button aria-label={`Remove player ${index + 1}`} disabled={players.length <= 5} onClick={() => setPlayers((current) => current.filter((item) => item.id !== player.id))}>Remove</button></div>)}</div><button className="tb-clear" onClick={() => { setPlayers(Array.from({ length: 10 }, (_, index) => newPlayer(Date.now() + index))); setResult(null); }}>Clear roster</button></section></div>{result && <section className="tb-results"><header><div><h2>Balanced teams</h2><p>MMR difference {Math.abs(total(result.teamA) - total(result.teamB))}</p></div><button onClick={copy}>Copy for Discord</button></header><div><Team name="Team A" players={result.teamA} side="a" /><Team name="Team B" players={result.teamB} side="b" /></div>{result.bench.length > 0 && <section className="tb-bench"><h3>Bench</h3><p>{result.bench.map((player) => player.name).join(", ")}</p></section>}</section>}<footer className="sp-footer"><a href="/">Home</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></footer></main>;
}
