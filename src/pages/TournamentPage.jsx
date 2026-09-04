import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { Check } from "@phosphor-icons/react/Check";
import { Copy } from "@phosphor-icons/react/Copy";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { Trophy } from "@phosphor-icons/react/Trophy";
import SiteHeader from "../components/SiteHeader.jsx";
import PublicFooter from "../components/PublicFooter.jsx";
import { clearMatchResult, createTournament, getTournament, listMyTournaments, migrateTournamentStorage, registerMyTournament, removeMyTournament, saveTournamentToken, setMatchResult, subscribeToTournament, tournamentToken, updateSeriesScore } from "../lib/tournaments.js";
import { navigate } from "../lib/spaRouter.js";

const sizes = Array.from({ length: 14 }, (_, index) => index + 3);
const formats = [
  { value: "single_elimination", label: "Single elimination" },
  { value: "double_elimination", label: "Double elimination" },
  { value: "round_robin", label: "Round robin" },
  { value: "swiss", label: "Swiss" },
];
const formatLabels = { single_elimination: "Single elimination", double_elimination: "Double elimination", round_robin: "Round robin", swiss: "Swiss" };

function roundName(round, finalRound) {
  const remaining = finalRound - round;
  if (remaining === 0) return "Final";
  if (remaining === 1) return "Semifinals";
  if (remaining === 2) return "Quarterfinals";
  return "Round of 16";
}
function roundLabel(round, maxRound, format, totalRounds) {
  if (format === "double_elimination") {
    const winnersRounds = Math.round((maxRound + 1) / 3);
    if (round <= winnersRounds) return round === winnersRounds ? "Winners Final" : `Winners Round ${round}`;
    if (round < maxRound) return `Losers Round ${round - winnersRounds}`;
    return "Grand Final";
  }
  if (format === "round_robin") return `Round ${round}`;
  if (format === "swiss") return totalRounds ? `Swiss Round ${round} of ${totalRounds}` : `Swiss Round ${round}`;
  return roundName(round, maxRound);
}

function copyText(text, setCopied) {
  navigator.clipboard?.writeText(text).then(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  });
}

function MyTournaments() {
  // Server-side status per slug. Fetches are staggered so the hub never
  // fires the whole registry at Supabase in one burst, and entries whose
  // localStorage metadata is stale (migrated stubs with no name) get
  // refreshed from draftix_tournament_state.
  const [entries, setEntries] = useState(() => listMyTournaments());
  const [statuses, setStatuses] = useState(() => ({}));

  useEffect(() => {
    if (!entries.length) return undefined;
    let cancelled = false;
    const timers = [];
    entries.forEach((entry, index) => {
      timers.push(window.setTimeout(async () => {
        try {
          const state = await getTournament(entry.slug, entry.token);
          if (cancelled || !state) return;
          // Self-heal registry metadata (migrated stubs, renamed tournaments).
          registerMyTournament({ slug: entry.slug, name: state.name, token: entry.token, format: state.format, teamCount: state.teamCount, createdAt: state.createdAt ? Date.parse(state.createdAt) : 0 });
          if (state.canManage) setStatuses((current) => ({ ...current, [entry.slug]: state.status }));
          else setStatuses((current) => ({ ...current, [entry.slug]: "unavailable" }));
        } catch {
          if (!cancelled) setStatuses((current) => ({ ...current, [entry.slug]: "unavailable" }));
        }
      }, index * 120));
    });
    return () => { cancelled = true; timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [entries]);

  function forget(slug) {
    removeMyTournament(slug);
    setEntries((current) => current.filter((entry) => entry.slug !== slug));
  }

  if (!entries.length) return <section className="my-tournaments" aria-label="My tournaments">
    <header><strong>My tournaments</strong><span>Organizer access saved on this device</span></header>
    <p className="my-tournaments-empty">No tournaments yet — create your first bracket and it will appear here for quick access.</p>
  </section>;
  return <section className="my-tournaments" aria-label="My tournaments">
    <header><strong>My tournaments</strong><span>Organizer access saved on this device</span></header>
    <ul>
      {entries.map((entry) => {
        const status = statuses[entry.slug] || "loading";
        return <li key={entry.slug}>
          <div className="my-tournament-info">
            <a className="my-tournament-name" href={`/t/${entry.slug}?key=${encodeURIComponent(entry.token)}`}>{entry.name || entry.slug}</a>
            <span className="my-tournament-meta">
              {entry.format ? `${formatLabels[entry.format] || entry.format} · ` : ""}{entry.teamCount ? `${entry.teamCount} teams` : ""}
            </span>
          </div>
          <span className={`tournament-status ${status === "loading" ? "" : status}`}>{status === "loading" ? "Checking…" : status === "unavailable" ? "Unavailable" : status}</span>
          <a className="my-tournament-manage" href={`/t/${entry.slug}?key=${encodeURIComponent(entry.token)}`}>{statuses[entry.slug] === "unavailable" ? "View" : "Manage"}</a>
          <button type="button" className="my-tournament-remove" onClick={() => forget(entry.slug)} aria-label={`Forget ${entry.name || entry.slug}`}>Forget</button>
        </li>;
      })}
    </ul>
  </section >;
}

export function TournamentHubPage() {
  const [activeHubTab, setActiveHubTab] = useState("create");
  const [size, setSize] = useState(8);
  const [name, setName] = useState("");
  const [bestOf, setBestOf] = useState(3);
  const [format, setFormat] = useState("single_elimination");
  const [teams, setTeams] = useState(() => Array.from({ length: 8 }, (_, index) => `Team ${index + 1}`));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function changeSize(next) {
    setSize(next);
    setTeams((current) => Array.from({ length: next }, (_, index) => current[index] || `Team ${index + 1}`));
  }

  function shuffleTeams() {
    setTeams((current) => {
      const shuffled = [...current];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      return shuffled;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await createTournament(name, teams.map((team) => team.trim()), bestOf, format);
      saveTournamentToken(result.slug, result.organizerToken);
      registerMyTournament({ slug: result.slug, name, token: result.organizerToken, format, teamCount: size });
      navigate(`/t/${result.slug}`);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return <div className="sp-page tournament-page">
    <SiteHeader />
    <main className="tournament-create-shell">
      <header className="tournament-intro">
        <span>Tournament builder</span>
        <h1>Build the bracket.</h1>
        <p>Create a live tournament bracket — single or double elimination, round robin, or Swiss — and share one public link.</p>
      </header>
      <section className="tournament-hub-workspace" aria-label="Tournament organizer">
        <nav className="tournament-hub-tabs" aria-label="Tournament organizer views">
          <button type="button" className={activeHubTab === "create" ? "is-active" : ""} aria-current={activeHubTab === "create" ? "page" : undefined} onClick={() => setActiveHubTab("create")}>Create tournament</button>
          <button type="button" className={activeHubTab === "history" ? "is-active" : ""} aria-current={activeHubTab === "history" ? "page" : undefined} onClick={() => setActiveHubTab("history")}>History</button>
        </nav>
        <div className="tournament-hub-panel">
        {activeHubTab === "create" ? <form className="tournament-form" onSubmit={submit}>
        <section className="tournament-form-section" aria-labelledby="tournament-details-heading">
          <header className="tournament-section-head"><span>01</span><div><h2 id="tournament-details-heading">Tournament details</h2><p>Name the event and choose how matches will run.</p></div></header>
          <div className="tournament-basics-grid">
            <label className="tournament-name-field">Tournament name<input value={name} maxLength="80" required placeholder="Community Cup" onChange={(event) => setName(event.target.value)} /></label>
            <label>Team count<select value={size} onChange={(event) => changeSize(Number(event.target.value))}>{sizes.map((option) => <option key={option} value={option}>{option} teams</option>)}</select></label>
            <label>Tournament format<select value={format} onChange={(event) => setFormat(event.target.value)}>{formats.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Series length<select value={bestOf} onChange={(event) => setBestOf(Number(event.target.value))}><option value="1">Best of 1</option><option value="3">Best of 3</option><option value="5">Best of 5</option><option value="7">Best of 7</option></select></label>
          </div>
        </section>
        <section className="tournament-form-section" aria-labelledby="tournament-teams-heading">
          <header className="tournament-section-head"><span>02</span><div><h2 id="tournament-teams-heading">Seed the teams</h2><p>Seeds determine the opening matchups.</p></div><button className="tournament-shuffle" type="button" onClick={shuffleTeams}><ArrowsClockwise aria-hidden="true" />Shuffle</button></header>
          <div className="tournament-team-fields">
            {teams.map((team, index) => <label key={index}><span>{String(index + 1).padStart(2, "0")}</span><input value={team} maxLength="40" required aria-label={`Seed ${index + 1} team name`} onChange={(event) => setTeams((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></label>)}
          </div>
        </section>
        {error && <p className="tournament-error" role="alert">{error}</p>}
        <footer className="tournament-form-actions">
          <p><strong>{size} teams</strong><span>{formatLabels[format]} · Best of {bestOf}</span></p>
          <button className="tournament-submit" type="submit" disabled={busy}>{busy ? "Creating bracket…" : <>Create tournament<ArrowRight aria-hidden="true" weight="bold" /></>}</button>
        </footer>
        </form> : <MyTournaments />}
        </div>
      </section>
    </main>
    <PublicFooter />
  </div>;
}

function MatchCard({ match, teams, canManage, bestOf = 1, onSave, onClear, onScore, busy }) {
  const [scoreA, setScoreA] = useState(match.scoreA ?? "");
  const [scoreB, setScoreB] = useState(match.scoreB ?? "");
  const [winner, setWinner] = useState(match.winnerTeamId || "");
  const [localError, setLocalError] = useState("");
  const teamA = teams.get(match.teamAId);
  const teamB = teams.get(match.teamBId);
  const isBye = Boolean(teamA) !== Boolean(teamB);
  // Only resync local inputs when the server-side saved values actually change,
  // not on every poll (each poll creates a new `match` object identity, which
  // used to wipe whatever the organizer was typing every 5 seconds).
  const savedScoresKey = `${match.id}:${match.scoreA ?? ""}:${match.scoreB ?? ""}:${match.winnerTeamId || ""}`;
  const savedScoresKeyRef = useRef(savedScoresKey);
  useEffect(() => {
    if (savedScoresKeyRef.current === savedScoresKey) return;
    savedScoresKeyRef.current = savedScoresKey;
    setScoreA(match.scoreA ?? "");
    setScoreB(match.scoreB ?? "");
    setWinner(match.winnerTeamId || "");
    setLocalError("");
  }, [savedScoresKey, match.scoreA, match.scoreB, match.winnerTeamId]);
  const isDecided = Boolean(match.winnerTeamId);
  // Two modes:
  //  - Live score: for best-of-N matches (N>1) that aren't decided yet — the
  //    organizer picks a current leader + the running score, then saves it
  //    live. The bracket doesn't advance; only the displayed score updates.
  //  - Final result: requires the winner to reach the required number of wins.
  const requiredWins = Math.ceil(bestOf / 2);
  const winnerScore = winner === match.teamAId ? scoreA : winner === match.teamBId ? scoreB : "";
  const loserScore = winner === match.teamAId ? scoreB : winner === match.teamBId ? scoreA : "";
  const isLiveSeries = bestOf > 1 && !isDecided;
  const scoreMismatch = Boolean(winner) && winnerScore !== "" && loserScore !== "" && Number(winnerScore) <= Number(loserScore);
  const wouldWinNow = isLiveSeries && Boolean(winner) && winnerScore !== "" && loserScore !== "" && Number(winnerScore) >= requiredWins && Number(winnerScore) > Number(loserScore);
  const seriesIncomplete = Boolean(winner) && winnerScore !== "" && Number(winnerScore) !== requiredWins;
  const liveScoreInvalid = busy || !winner || scoreA === "" || scoreB === "" || scoreMismatch;
  const finalInvalid = busy || !winner || scoreA === "" || scoreB === "" || scoreMismatch || seriesIncomplete;
  function changeScore(setScore) {
    return (event) => { setLocalError(""); setScore(event.target.value); };
  }
  function changeWinner(teamId) {
    return () => { setLocalError(""); setWinner(teamId); };
  }
  function saveLive() {
    if (liveScoreInvalid) return;
    setLocalError("");
    onScore(match.id, Number(scoreA), Number(scoreB));
  }
  function saveFinal() {
    if (finalInvalid) return;
    if (Number(scoreA) === Number(scoreB)) { setLocalError("Scores cannot be tied — pick a winner with the higher score."); return; }
    if (seriesIncomplete) { setLocalError(`Best of ${bestOf} — the winner must score ${requiredWins} maps.`); return; }
    onSave(match.id, Number(scoreA), Number(scoreB), winner);
  }
  return <article className={`bracket-match${isDecided ? " is-complete" : ""}${isBye ? " is-bye" : ""}`} data-match-id={match.id}>
    <div className="bracket-match-label">Match {match.position}</div>
    {[teamA, teamB].map((team, index) => {
      const teamId = index ? match.teamBId : match.teamAId;
      const value = index ? scoreB : scoreA;
      return <div className={`bracket-team${winner === teamId ? " is-winner" : ""}`} key={index}>
        <button type="button" disabled={!canManage || !team || busy || isDecided} onClick={changeWinner(teamId)}><span>{team ? <><small>{team.seed}</small>{team.name}</> : isBye ? "Bye" : "TBD"}</span>{match.winnerTeamId === teamId && <b>W</b>}</button>
        {canManage && teamA && teamB && !isDecided ? <input aria-label={`${team?.name || "Team"} score`} type="number" min="0" max={bestOf} value={value} onChange={changeScore(index ? setScoreB : setScoreA)} /> : <span className="bracket-score">{value === "" ? "—" : value}</span>}
      </div>;
    })}
    {canManage && teamA && teamB && !isDecided && <div className="bracket-actions">
      {isLiveSeries && <button type="button" disabled={liveScoreInvalid} onClick={saveLive} className="is-outline">{wouldWinNow ? `Win series ${requiredWins}-${Math.max(0, Number(loserScore))}` : "Save live score"}</button>}
      <button type="button" disabled={finalInvalid} onClick={saveFinal}>{seriesIncomplete ? `Needs ${requiredWins} wins` : scoreMismatch ? "Winner needs higher score" : "Save final result"}</button>
      {(match.scoreA !== null || match.scoreB !== null) ? <button type="button" disabled={busy} onClick={() => onScore(match.id, null, null)}>Clear score</button> : ""}
    </div>}
    {canManage && teamA && teamB && localError && <p className="bracket-match-error" role="alert">{localError}</p>}
  </article>;
}

function BracketConnectors({ boardRef, matches }) {
  const [drawing, setDrawing] = useState({ width: 0, height: 0, paths: [] });
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;
    const draw = () => {
      const boardBox = board.getBoundingClientRect();
      const paths = matches.flatMap((match) => {
        if (!match.nextMatchId) return [];
        const source = board.querySelector(`[data-match-id="${CSS.escape(match.id)}"]`);
        const target = board.querySelector(`[data-match-id="${CSS.escape(match.nextMatchId)}"]`);
        if (!source || !target) return [];
        const from = source.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const x1 = from.right - boardBox.left;
        const y1 = from.top + from.height / 2 - boardBox.top;
        const x2 = to.left - boardBox.left;
        const y2 = to.top + to.height / 2 - boardBox.top;
        const middle = x1 + (x2 - x1) / 2;
        return [`M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`];
      });
      setDrawing({ width: board.scrollWidth, height: board.scrollHeight, paths });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(board);
    board.querySelectorAll("[data-match-id]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [boardRef, matches]);
  return <svg className="bracket-connectors" width={drawing.width} height={drawing.height} viewBox={`0 0 ${drawing.width} ${drawing.height}`} aria-hidden="true">
    {drawing.paths.map((path, index) => <path d={path} key={`${path}-${index}`} />)}
  </svg>;
}

export default function TournamentPage({ slug }) {
  // One-time upgrade of any pre-persistence sessionStorage tokens.
  useEffect(() => { migrateTournamentStorage(); }, []);
  const queryToken = new URLSearchParams(window.location.search).get("key") || "";
  const [token] = useState(() => queryToken || tournamentToken(slug));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyMatch, setBusyMatch] = useState("");
  const [copied, setCopied] = useState(false);
  const boardRef = useRef(null);
  const load = useCallback(async () => {
    try { setData(await getTournament(slug, token)); setError(""); }
    catch (requestError) { setError(requestError.message); }
  }, [slug, token]);

  useEffect(() => {
    if (queryToken) {
      saveTournamentToken(slug, queryToken);
      window.history.replaceState({}, "", `/t/${slug}`);
    }
    load();
  }, [load, queryToken, slug]);
  useEffect(() => data?.id ? subscribeToTournament(data.id, load) : undefined, [data?.id, load]);
  useEffect(() => { if (data?.name) document.title = `${data.name} Bracket | Draftix`; }, [data?.name]);
  // Keep the "My tournaments" registry in sync while the organizer is here:
  // captures organizer-link visits on this machine and refreshes names on
  // every bracket load (self-heal, skips writes when nothing changed).
  useEffect(() => {
    if (!token || !data?.name || !data.canManage) return;
    registerMyTournament({ slug, name: data.name, token, format: data.format, teamCount: data.teamCount, createdAt: data.createdAt ? Date.parse(data.createdAt) : 0 });
  }, [slug, token, data?.name, data?.canManage, data?.format, data?.teamCount, data?.createdAt]);

  const teams = useMemo(() => new Map((data?.teams || []).map((team) => [team.id, team])), [data?.teams]);
  const rounds = useMemo(() => {
    const grouped = new Map();
    for (const match of data?.matches || []) grouped.set(match.round, [...(grouped.get(match.round) || []), match]);
    return [...grouped.entries()];
  }, [data?.matches]);

  async function save(matchId, scoreA, scoreB, winnerTeamId) {
    setBusyMatch(matchId); setError("");
    try { await setMatchResult(slug, token, matchId, scoreA, scoreB, winnerTeamId); await load(); }
    catch (requestError) { setError(requestError.message); }
    setBusyMatch("");
  }
  async function clear(matchId) {
    setBusyMatch(matchId); setError("");
    try { await clearMatchResult(slug, token, matchId); await load(); }
    catch (requestError) { setError(requestError.message); }
    setBusyMatch("");
  }
  async function updateScore(matchId, scoreA, scoreB) {
    setBusyMatch(matchId); setError("");
    try { await updateSeriesScore(slug, token, matchId, scoreA, scoreB); await load(); }
    catch (requestError) { setError(requestError.message); }
    setBusyMatch("");
  }

  if (!data) return <div className="sp-page tournament-page"><SiteHeader /><main className="tournament-loading"><p>{error || "Loading bracket…"}</p>{error && <a href="/tournaments">Create a tournament</a>}</main></div>;
  const maxRound = Math.max(...rounds.map(([round]) => round));
  const formatLabel = formatLabels[data.format] || data.format;
  const champion = teams.get(data.championTeamId);
  // Final result (elimination formats): the bracket final is the match with no next match
  const finalMatch = (data.format === "single_elimination" || data.format === "double_elimination")
    ? (data.matches || []).find((m) => !m.nextMatchId && m.winnerTeamId && m.teamAId && m.teamBId)
    : null;
  const runnerUp = finalMatch ? teams.get(finalMatch.winnerTeamId === finalMatch.teamAId ? finalMatch.teamBId : finalMatch.teamAId) : null;
  const finalScore = finalMatch ? (finalMatch.winnerTeamId === finalMatch.teamAId ? `${finalMatch.scoreA}–${finalMatch.scoreB}` : `${finalMatch.scoreB}–${finalMatch.scoreA}`) : "";
  const showStandings = (data.format === "round_robin" || data.format === "swiss") && Array.isArray(data.standings) && data.standings.length > 0;
  const shareUrl = `${window.location.origin}/t/${slug}`;
  const manageUrl = token ? `${shareUrl}?key=${token}` : "";
  return <div className="sp-page tournament-page tournament-view-page">
    <SiteHeader />
    <main className="tournament-view-shell">
      <header className="tournament-view-head">
        <div><span className={`tournament-status ${data.status}`}>{data.status}</span><h1>{data.name}</h1><p>{data.teamCount} teams · {formatLabel} · Best of {data.bestOf}</p></div>
        <div className="tournament-share-actions">
          <button type="button" onClick={() => copyText(shareUrl, setCopied)}>{copied ? <Check aria-hidden="true" weight="bold" /> : <Copy aria-hidden="true" />}<span>{copied ? "Copied" : "Public link"}</span></button>
          {data.canManage && <button type="button" onClick={() => copyText(manageUrl, setCopied)}><ShieldCheck aria-hidden="true" /><span>Organizer link</span></button>}
          {data.canManage && <a className="launch-drafting" href="/draft" target="_blank" rel="noreferrer" aria-label="Open the Draftix drafting room in a new tab">Launch drafting<ArrowRight aria-hidden="true" weight="bold" /></a>}
        </div>
      </header>
      {data.canManage && <p className="organizer-banner"><strong>Organizer mode</strong> Select a winner, enter the score, then save.</p>}
      {error && <p className="tournament-error" role="alert">{error}</p>}
      {champion && <section className="champion-banner" aria-label="Tournament champion">
        <div className="champion-banner-year" aria-hidden="true">
          <span>{new Date().getFullYear().toString().slice(0, 2)}</span>
          <Trophy className="champion-banner-mark" aria-hidden="true" weight="duotone" />
          <span>{new Date().getFullYear().toString().slice(2)}</span>
        </div>
        <h2 className="champion-banner-title">{data.name}</h2>
        <p className="champion-banner-sub">Champions</p>
        <div className="champion-banner-team">{champion.name}</div>
        {runnerUp && <span className="champion-banner-final">def. {runnerUp.name} {finalScore}</span>}
        <span className="champion-banner-meta">{formatLabel} · Best of {data.bestOf}</span>
      </section>}
      {showStandings && <section className="tournament-standings" aria-label="Standings">
        <table>
          <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>Diff</th><th>P</th></tr></thead>
          <tbody>
            {data.standings.map((row, index) => <tr key={row.teamId} className={index === 0 && data.status === "completed" ? "is-leader" : ""}>
              <td>{index + 1}</td><td>{row.name}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td><td>{row.played}</td>
            </tr>)}
          </tbody>
        </table>
      </section>}
      <section className="bracket-panel" aria-labelledby="bracket-heading">
        <header className="bracket-panel-head"><div><h2 id="bracket-heading">Bracket</h2><p>{rounds.length} rounds · {data.matches.length} matches</p></div></header>
        <div className="bracket-scroll" aria-label={`${data.name} tournament bracket`}>
          <div className="bracket-board" ref={boardRef}>
            <BracketConnectors boardRef={boardRef} matches={data.matches} />
            {rounds.map(([round, matches]) => <section className="bracket-round" key={round}>
              <header><span>{String(round).padStart(2, "0")}</span><h2>{roundLabel(round, maxRound, data.format, data.totalRounds)}</h2></header>
              <div className="bracket-round-matches">{matches.map((match) => <MatchCard key={match.id} match={match} teams={teams} bestOf={data.bestOf} canManage={data.canManage} busy={busyMatch === match.id} onSave={save} onClear={clear} onScore={updateScore} />)}</div>
            </section>)}
          </div>
        </div>
      </section>
    </main>
    <PublicFooter />
  </div>;
}
