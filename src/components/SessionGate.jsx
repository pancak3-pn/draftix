import { useEffect, useReducer, useRef, useState } from "react";
import { createDraftSocket } from "../socket/draftSocket";
import { draftReducer, getNickname, saveNickname, sessionCodeFromUrl } from "../state/draftReducer";
import DraftBoard from "./DraftBoard.jsx";

function Logo() {
  return <a className="dx-logo" href="/" aria-label="Draftix home"><img src="/images/draftix.png" alt="" /><strong>DRAFT<span>IX</span></strong></a>;
}

export default function SessionGate() {
  const [state, dispatch] = useReducer(draftReducer, { connection: "connecting", session: null, error: "", pending: false });
  const [nickname, setNickname] = useState(getNickname());
  const [code, setCode] = useState(sessionCodeFromUrl());
  const clientRef = useRef(null);
  const resumeRef = useRef(false);

  useEffect(() => {
    document.body.classList.add("page-app");
    clientRef.current = createDraftSocket({
      onState: (value) => dispatch({ type: "state", value }),
      onChat: (value) => dispatch({ type: "chat", value }),
      onConnection: (value) => {
        dispatch({ type: "connection", value });
        const resumeCode = sessionCodeFromUrl();
        if (value === "online" && resumeCode && !resumeRef.current) {
          resumeRef.current = true;
          clientRef.current?.join(resumeCode, nickname.trim() || getNickname() || "Player");
        }
      },
      onError: (value) => dispatch({ type: "error", value }),
    });
    return () => {
      document.body.classList.remove("page-app");
      clientRef.current?.close();
    };
  }, []);

  function finish(result) {
    if (!result?.ok) {
      dispatch({ type: "error", value: result?.error || "Could not join the session." });
      return;
    }
    if (result.code) window.history.replaceState({}, "", `/app?code=${result.code}`);
  }

  function submit(mode) {
    const name = nickname.trim() || (mode === "create" ? "Host" : "Player");
    const roomCode = code.trim().toUpperCase();
    if (mode === "join" && !roomCode) {
      dispatch({ type: "error", value: "Enter a session code." });
      return;
    }
    if (state.connection !== "online") {
      dispatch({ type: "error", value: "Draftix is still connecting. Try again in a moment." });
      return;
    }
    saveNickname(name);
    dispatch({ type: "pending", value: true });
    if (mode === "create") clientRef.current?.create(name, finish);
    else clientRef.current?.join(roomCode, name, finish);
  }

  if (state.session && !state.session.closed) {
    return state.session.phase === "lobby"
      ? <Lobby session={state.session} client={clientRef.current} connection={state.connection} />
      : <DraftBoard session={state.session} client={clientRef.current} connection={state.connection} />;
  }

  return <main className="dx-entry"><header className="dx-entry-nav"><Logo /><a href="/">Back to home</a></header><div className="dx-entry-layout"><section className="dx-entry-copy"><h1>Set up the room.</h1><p>Create a new draft or enter the code your captain shared.</p><div className={`dx-connection is-${state.connection}`}><span />{state.connection === "online" ? "Server connected" : "Connecting to server"}</div></section><section className="dx-entry-panel" aria-label="Draft access"><label className="dx-field"><span>Your name</span><input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} placeholder="Player name" autoComplete="username" /></label><button className="dx-button dx-button-primary" disabled={state.pending || state.connection !== "online"} onClick={() => submit("create")}>{state.pending ? "Working..." : "Create a room"}</button><div className="dx-divider"><span>Join an existing room</span></div><label className="dx-field"><span>Room code</span><input className="dx-code-input" value={code} maxLength={8} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC12X" autoComplete="off" /></label><button className="dx-button dx-button-secondary" disabled={state.pending || state.connection !== "online"} onClick={() => submit("join")}>Join room</button>{state.error && <p className="dx-error" role="alert">{state.error}</p>}</section></div></main>;
}

function TeamPanel({ side, session, send }) {
  const name = session.teamNames?.[side] || `Team ${side}`;
  const captain = session.captainNames?.[side];
  const roster = session.teamRosters?.[side] || [];
  const isOnTeam = session.me?.myTeam === side;
  return <aside className={`dx-team dx-team-${side.toLowerCase()}`}><header><div><h2>{name}</h2><p>{captain ? "Captain ready" : "Captain seat open"}</p></div><span>{side}</span></header><div className="dx-captain"><strong>{captain || "No captain"}</strong><small>Captain</small></div><ul className="dx-roster">{roster.length ? roster.map((player) => <li key={player.id}><span>{player.nickname}</span>{player.isCaptain && <small>Captain</small>}</li>) : <li className="is-empty">No players yet</li>}</ul><div className="dx-team-actions"><button onClick={() => send("claimCaptain", { team: side })}>{captain ? "Captain taken" : "Claim captain"}</button><button className="is-quiet" onClick={() => send("setTeam", { team: side })}>{isOnTeam ? "On this team" : "Join team"}</button></div></aside>;
}

function Lobby({ session, client, connection }) {
  const [names, setNames] = useState(session.teamNames || { A: "Team A", B: "Team B" });
  const [settings, setSettings] = useState(session.settings || { draftPreset: "competitive", agentBanCount: 6, turnTimeoutMs: 30000, sidePickEnabled: true, autoBanEnabled: true });
  const send = (event, payload = {}) => client?.socket.emit(event, { code: session.code, ...payload });
  const bothCaptains = Boolean(session.captainNames?.A && session.captainNames?.B);

  function leave() {
    client?.socket.emit("leaveSession", { code: session.code }, () => { window.location.href = "/app"; });
  }

  async function copyCode() {
    const url = `${window.location.origin}/app?code=${session.code}`;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("Copy this room link:", url); }
  }

  return <main className="dx-app"><header className="dx-appbar"><Logo /><div className="dx-phase"><strong>Lobby</strong><span>Room {session.code}</span></div><div className="dx-app-actions"><span className={`dx-live is-${connection}`}><i />{connection}</span><button onClick={leave}>Leave</button></div></header><div className="dx-lobby"><TeamPanel side="A" session={session} send={send} /><section className="dx-room"><header><h1>{bothCaptains ? "Ready to start" : "Waiting for captains"}</h1><p>Share the room link, then claim one captain seat per team.</p></header><button className="dx-room-code" onClick={copyCode} title="Copy room link"><strong>{session.code}</strong><span>Copy room link</span></button>{session.me?.isHost && <div className="dx-host-controls"><div className="dx-control-group"><h2>Team names</h2><div className="dx-two-fields"><label className="dx-field"><span>Team A</span><input value={names.A} maxLength={24} onChange={(event) => setNames({ ...names, A: event.target.value })} /></label><label className="dx-field"><span>Team B</span><input value={names.B} maxLength={24} onChange={(event) => setNames({ ...names, B: event.target.value })} /></label></div><button className="dx-text-button" onClick={() => send("setTeamNames", names)}>Save names</button></div><div className="dx-control-group"><h2>Draft format</h2><div className="dx-settings-grid"><label className="dx-field"><span>Preset</span><select value={settings.draftPreset} onChange={(event) => setSettings({ ...settings, draftPreset: event.target.value })}><option value="competitive">Competitive</option><option value="quick">Quick</option><option value="no-agents">No agent bans</option><option value="custom">Custom</option></select></label><label className="dx-field"><span>Agent bans</span><input type="number" min="0" max="12" value={settings.agentBanCount} onChange={(event) => setSettings({ ...settings, agentBanCount: Number(event.target.value) })} /></label><label className="dx-field"><span>Turn time</span><select value={settings.turnTimeoutMs} onChange={(event) => setSettings({ ...settings, turnTimeoutMs: Number(event.target.value) })}><option value="15000">15 seconds</option><option value="30000">30 seconds</option><option value="45000">45 seconds</option><option value="60000">60 seconds</option></select></label></div><div className="dx-checks"><label><input type="checkbox" checked={settings.sidePickEnabled !== false} onChange={(event) => setSettings({ ...settings, sidePickEnabled: event.target.checked })} /> Side pick</label><label><input type="checkbox" checked={settings.autoBanEnabled !== false} onChange={(event) => setSettings({ ...settings, autoBanEnabled: event.target.checked })} /> Auto-ban timer</label></div><button className="dx-text-button" onClick={() => send("setGameSettings", settings)}>Save format</button></div></div>}<button className="dx-button dx-button-primary dx-start" disabled={!session.me?.isHost || !bothCaptains} onClick={() => send("startDraft")}>{!session.me?.isHost ? "Host starts the draft" : bothCaptains ? "Start draft" : "Both captains required"}</button></section><TeamPanel side="B" session={session} send={send} /></div></main>;
}
