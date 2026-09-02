import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SiteHeader from "../components/SiteHeader.jsx";
import PublicFooter from "../components/PublicFooter.jsx";
import { clearMatchResult, createTournament, getTournament, saveTournamentToken, setMatchResult, subscribeToTournament, tournamentToken } from "../lib/tournaments.js";

const sizes = Array.from({ length: 14 }, (_, index) => index + 3);
function roundName(round, finalRound) {
  const remaining = finalRound - round;
  if (remaining === 0) return "Final";
  if (remaining === 1) return "Semifinals";
  if (remaining === 2) return "Quarterfinals";
  return "Round of 16";
}

function copyText(text, setCopied) {
  navigator.clipboard?.writeText(text).then(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  });
}

export function TournamentHubPage() {
  const [size, setSize] = useState(8);
  const [name, setName] = useState("");
  const [bestOf, setBestOf] = useState(3);
  const [teams, setTeams] = useState(() => Array.from({ length: 8 }, (_, index) => `Team ${index + 1}`));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function changeSize(next) {
    setSize(next);
    setTeams((current) => Array.from({ length: next }, (_, index) => current[index] || `Team ${index + 1}`));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await createTournament(name, teams.map((team) => team.trim()), bestOf);
      saveTournamentToken(result.slug, result.organizerToken);
      window.location.assign(`/t/${result.slug}`);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return <div className="sp-page tournament-page">
    <SiteHeader />
    <main className="tournament-create-shell">
      <header className="tournament-intro">
        <h1>Build the bracket.</h1>
        <p>Create a live single-elimination tournament and share one public link.</p>
      </header>
      <form className="tournament-form" onSubmit={submit}>
        <div className="tournament-form-head"><strong>Tournament setup</strong></div>
        <label>Tournament name<input value={name} maxLength="80" required placeholder="Community Cup" onChange={(event) => setName(event.target.value)} /></label>
        <div className="tournament-options">
          <label>Team count<select value={size} onChange={(event) => changeSize(Number(event.target.value))}>{sizes.map((option) => <option key={option} value={option}>{option} teams</option>)}</select></label>
          <label>Match format<select value={bestOf} onChange={(event) => setBestOf(Number(event.target.value))}><option value="1">Best of 1</option><option value="3">Best of 3</option><option value="5">Best of 5</option></select></label>
        </div>
        <div className="tournament-team-fields">
          {teams.map((team, index) => <label key={index}><span>{String(index + 1).padStart(2,"0")}</span><input value={team} maxLength="40" required aria-label={`Seed ${index + 1} team name`} onChange={(event) => setTeams((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></label>)}
        </div>
        {error && <p className="tournament-error" role="alert">{error}</p>}
        <button className="tournament-submit" type="submit" disabled={busy}>{busy ? "Creating bracket…" : "Create tournament"}</button>
      </form>
    </main>
    <PublicFooter />
  </div>;
}

function MatchCard({ match, teams, canManage, onSave, onClear, busy }) {
  const [scoreA, setScoreA] = useState(match.scoreA ?? "");
  const [scoreB, setScoreB] = useState(match.scoreB ?? "");
  const [winner, setWinner] = useState(match.winnerTeamId || "");
  const [localError, setLocalError] = useState("");
  const teamA = teams.get(match.teamAId);
  const teamB = teams.get(match.teamBId);
  const isBye = match.round === 1 && Boolean(teamA) !== Boolean(teamB);
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
  const ready = teamA && teamB;
  const winnerScore = winner === match.teamAId ? scoreA : winner === match.teamBId ? scoreB : "";
  const loserScore = winner === match.teamAId ? scoreB : winner === match.teamBId ? scoreA : "";
  const scoreMismatch = Boolean(winner) && winnerScore !== "" && loserScore !== "" && Number(winnerScore) <= Number(loserScore);
  const invalid = busy || !winner || scoreA === "" || scoreB === "" || scoreMismatch;
  function changeScore(setScore) {
    return (event) => { setLocalError(""); setScore(event.target.value); };
  }
  function changeWinner(teamId) {
    return () => { setLocalError(""); setWinner(teamId); };
  }
  function save() {
    if (invalid) return;
    if (Number(scoreA) === Number(scoreB)) { setLocalError("Scores cannot be tied — pick a winner with the higher score."); return; }
    onSave(match.id, Number(scoreA), Number(scoreB), winner);
  }
  return <article className={`bracket-match${match.winnerTeamId ? " is-complete" : ""}${isBye ? " is-bye" : ""}`} data-match-id={match.id}>
    <div className="bracket-match-label">Match {match.position}</div>
    {[teamA, teamB].map((team, index) => {
      const teamId = index ? match.teamBId : match.teamAId;
      const value = index ? scoreB : scoreA;
      return <div className={`bracket-team${winner === teamId ? " is-winner" : ""}`} key={index}>
        <button type="button" disabled={!canManage || !team || busy} onClick={changeWinner(teamId)}><span>{team ? <><small>{team.seed}</small>{team.name}</> : isBye ? "Bye" : "TBD"}</span>{match.winnerTeamId === teamId && <b>W</b>}</button>
        {canManage && ready ? <input aria-label={`${team?.name || "Team"} score`} type="number" min="0" max="99" value={value} onChange={changeScore(index ? setScoreB : setScoreA)} /> : <span className="bracket-score">{value === "" ? "—" : value}</span>}
      </div>;
    })}
    {canManage && ready && <div className="bracket-actions">
      <button type="button" disabled={invalid} onClick={save}>{scoreMismatch ? "Winner needs higher score" : "Save result"}</button>
      {match.winnerTeamId && <button type="button" disabled={busy} onClick={() => onClear(match.id)}>Clear</button>}
    </div>}
    {canManage && ready && localError && <p className="bracket-match-error" role="alert">{localError}</p>}
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

  if (!data) return <div className="sp-page tournament-page"><SiteHeader /><main className="tournament-loading"><p>{error || "Loading bracket…"}</p>{error && <a href="/tournaments">Create a tournament</a>}</main></div>;
  const maxRound = Math.max(...rounds.map(([round]) => round));
  const champion = teams.get(data.matches.find((match) => match.round === maxRound)?.winnerTeamId);
  const shareUrl = `${window.location.origin}/t/${slug}`;
  const manageUrl = token ? `${shareUrl}?key=${token}` : "";
  return <div className="sp-page tournament-page tournament-view-page">
    <SiteHeader />
    <main className="tournament-view-shell">
      <header className="tournament-view-head">
        <div><span className={`tournament-status ${data.status}`}>{data.status}</span><h1>{data.name}</h1><p>{data.teamCount} teams · Single elimination · Best of {data.bestOf}</p></div>
        <div className="tournament-share-actions">
          <button type="button" onClick={() => copyText(shareUrl,setCopied)}>{copied ? "Copied" : "Copy public link"}</button>
          {data.canManage && <button type="button" onClick={() => copyText(manageUrl,setCopied)}>Copy organizer link</button>}
        </div>
      </header>
      {data.canManage && <p className="organizer-banner"><strong>Organizer mode</strong> Select a winner, enter the score, then save.</p>}
      {error && <p className="tournament-error" role="alert">{error}</p>}
      {champion && <section className="tournament-champion"><span>Champion</span><strong>{champion.name}</strong></section>}
      <div className="bracket-scroll" aria-label={`${data.name} tournament bracket`}>
        <div className="bracket-board" ref={boardRef}>
          <BracketConnectors boardRef={boardRef} matches={data.matches} />
          {rounds.map(([round, matches]) => <section className="bracket-round" key={round}>
            <header><span>{String(round).padStart(2,"0")}</span><h2>{roundName(round,maxRound)}</h2></header>
            <div className="bracket-round-matches">{matches.map((match) => <MatchCard key={match.id} match={match} teams={teams} canManage={data.canManage} busy={busyMatch === match.id} onSave={save} onClear={clear} />)}</div>
          </section>)}
        </div>
      </div>
    </main>
    <PublicFooter />
  </div>;
}
