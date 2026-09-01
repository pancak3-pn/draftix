import { useEffect, useReducer, useRef, useState } from "react";
import { createDraftSocket } from "../socket/draftSocket";
import { draftReducer, getNickname, saveNickname, sessionCodeFromUrl } from "../state/draftReducer";
import DraftBoard from "./DraftBoard.jsx";

function Logo() {
  return <a className="dx-logo" href="/" aria-label="Draftix home"><img src="/images/draftix.png" alt="" /><strong>DRAFT<span>IX</span></strong></a>;
}

function prepareTeamLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type.startsWith("image/")) return reject(new Error("Choose an image file."));
    if (file.size > 5 * 1024 * 1024) return reject(new Error("Logo must be smaller than 5 MB."));
    const image = new Image();
    const source = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, 160, 160);
      const scale = Math.min(144 / image.width, 144 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (160 - width) / 2, (160 - height) / 2, width, height);
      URL.revokeObjectURL(source);
      resolve(canvas.toDataURL("image/webp", .82));
    };
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error("That image could not be opened.")); };
    image.src = source;
  });
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

  return <main className="dx-entry"><header className="dx-entry-nav"><Logo /><a href="/">Back to home</a></header><div className="dx-entry-layout"><section className="dx-entry-copy"><h1>Set up<br />the room.</h1></section><section className="dx-entry-panel" aria-label="Draft access"><header className="dx-panel-heading"><span>Room access</span><strong>01 / Connect</strong></header><label className="dx-field"><span>Your name</span><input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} placeholder="Player name" autoComplete="username" /></label><button className="dx-button dx-button-primary" disabled={state.pending || state.connection !== "online"} onClick={() => submit("create")}>{state.pending ? "Working..." : "Create a room"}</button><div className="dx-divider"><span>or join the briefing</span></div><label className="dx-field"><span>Room code</span><input className="dx-code-input" value={code} maxLength={8} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC12X" autoComplete="off" /></label><button className="dx-button dx-button-secondary" disabled={state.pending || state.connection !== "online"} onClick={() => submit("join")}>Join room</button>{state.error && <p className="dx-error" role="alert">{state.error}</p>}</section></div></main>;
}

function TeamPanel({ side, session, send }) {
  const [previewName, setPreviewName] = useState(session.teamNames?.[side] || `Team ${side}`);
  const name = previewName.trim() || `Team ${side}`;
  const captain = session.captainNames?.[side];
  const roster = session.teamRosters?.[side] || [];
  const isOnTeam = session.me?.myTeam === side;
  const teamLogo = session.teamLogos?.[side] || null;

  useEffect(() => {
    setPreviewName(session.teamNames?.[side] || `Team ${side}`);
  }, [session.teamNames?.[side], side]);

  useEffect(() => {
    const updatePreview = (event) => setPreviewName(event.detail?.[side] || "");
    window.addEventListener("draftix:team-name-preview", updatePreview);
    return () => window.removeEventListener("draftix:team-name-preview", updatePreview);
  }, [side]);

  async function changeLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const logo = await prepareTeamLogo(file);
      send("setTeamLogos", { ...(session.teamLogos || { A: null, B: null }), [side]: logo });
    } catch (error) {
      window.alert(error.message);
    }
  }

  function removeLogo() {
    send("setTeamLogos", { ...(session.teamLogos || { A: null, B: null }), [side]: null });
  }

  return <aside className={`dx-team dx-team-${side.toLowerCase()}${isOnTeam ? " is-my-team" : ""}`}>
    <header><div><small>Squad {side}</small><h2>{name}</h2><p>{captain ? "Command seat locked" : "Captain seat open"}</p></div><span className={`dx-team-mark${teamLogo ? " has-logo" : ""}`}>{teamLogo ? <img src={teamLogo} alt={`${name} logo`} /> : side}</span></header>
    {session.me?.isHost && <div className="dx-team-logo-tools"><label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={changeLogo} /><span>{teamLogo ? "Replace logo" : "Upload logo"}</span></label>{teamLogo && <button type="button" onClick={removeLogo}>Remove</button>}</div>}
    <div className="dx-captain"><small>Captain</small><strong>{captain || "Unassigned"}</strong><i className={captain ? "is-ready" : ""} /></div>
    <ul className="dx-roster">{roster.length ? roster.map((player) => <li key={player.id}><span>{player.nickname}</span>{player.isCaptain && <small>Captain</small>}</li>) : <li className="is-empty">Awaiting players</li>}</ul>
    <div className="dx-team-actions"><button onClick={() => send("claimCaptain", { team: side })}>{captain ? "Captain locked" : "Claim captain"}</button><button className="is-quiet" onClick={() => send("setTeam", { team: side })}>{isOnTeam ? "Your squad" : "Join squad"}</button></div>
  </aside>;
}

function Lobby({ session, client, connection }) {
  const [names, setNames] = useState(session.teamNames || { A: "Team A", B: "Team B" });
  const [settings, setSettings] = useState(session.settings || { draftPreset: "competitive", agentBanCount: 6, turnTimeoutMs: 30000, sidePickEnabled: true, autoBanEnabled: true });
  const send = (event, payload = {}) => client?.socket.emit(event, { code: session.code, ...payload });
  const bothCaptains = Boolean(session.captainNames?.A && session.captainNames?.B);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("draftix:team-name-preview", { detail: names }));
  }, [names]);

  useEffect(() => {
    setNames(session.teamNames || { A: "Team A", B: "Team B" });
  }, [session.teamNames?.A, session.teamNames?.B]);

  function leave() {
    client?.socket.emit("leaveSession", { code: session.code }, () => { window.location.href = "/app"; });
  }

  async function copyCode() {
    const url = `${window.location.origin}/app?code=${session.code}`;
    try {
      await navigator.clipboard.writeText(url);
      document.querySelector(".dx-copy-notice")?.remove();
      const notice = document.createElement("div");
      notice.className = "dx-copy-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      notice.innerHTML = `<i aria-hidden="true">✓</i><span><strong>Invite copied</strong><small>Room ${session.code} is ready to share</small></span>`;
      document.body.appendChild(notice);
      window.requestAnimationFrame(() => notice.classList.add("is-visible"));
      window.setTimeout(() => notice.classList.remove("is-visible"), 1900);
      window.setTimeout(() => notice.remove(), 2250);
    } catch {
      window.prompt("Copy this room link:", url);
    }
  }

  return <main className="dx-app"><header className="dx-appbar"><Logo /><div className="dx-phase"><strong>Pre-match lobby</strong><span>Room {session.code}</span></div><div className="dx-app-actions"><span className={`dx-live is-${connection}`}><i />{connection}</span><button onClick={leave}>Leave</button></div></header><div className="dx-lobby"><TeamPanel side="A" session={session} send={send} /><section className="dx-room"><div className="dx-room-status"><span>{bothCaptains ? "Briefing complete" : "Captain check"}</span><b>{bothCaptains ? "2 / 2 ready" : `${Number(Boolean(session.captainNames?.A)) + Number(Boolean(session.captainNames?.B))} / 2 ready`}</b></div><header><h1>{bothCaptains ? "Ready to draft" : "Build the matchup"}</h1><p>Send the room link, seat one captain on each squad, then launch the veto.</p></header><button className="dx-room-code" onClick={copyCode} title="Copy room link"><small>Private room code</small><strong>{session.code}</strong><span>Click to copy invite link</span></button>{session.me?.isHost && <div className="dx-host-controls"><div className="dx-control-group"><h2><span>01</span> Team identity</h2><div className="dx-two-fields"><label className="dx-field"><span>Squad A</span><input value={names.A} maxLength={24} onChange={(event) => setNames({ ...names, A: event.target.value })} /></label><label className="dx-field"><span>Squad B</span><input value={names.B} maxLength={24} onChange={(event) => setNames({ ...names, B: event.target.value })} /></label></div><button className="dx-text-button" onClick={() => send("setTeamNames", names)}>Apply team names</button></div><div className="dx-control-group"><h2><span>02</span> Draft rules</h2><div className="dx-settings-grid"><label className="dx-field"><span>Preset</span><select value={settings.draftPreset} onChange={(event) => setSettings({ ...settings, draftPreset: event.target.value })}><option value="competitive">Competitive</option><option value="quick">Quick</option><option value="no-agents">No agent bans</option><option value="custom">Custom</option></select></label><label className="dx-field"><span>Agent bans</span><input type="number" min="0" max="12" value={settings.agentBanCount} onChange={(event) => setSettings({ ...settings, agentBanCount: Number(event.target.value) })} /></label><label className="dx-field"><span>Turn time</span><select value={settings.turnTimeoutMs} onChange={(event) => setSettings({ ...settings, turnTimeoutMs: Number(event.target.value) })}><option value="15000">15 seconds</option><option value="30000">30 seconds</option><option value="45000">45 seconds</option><option value="60000">60 seconds</option></select></label></div><div className="dx-checks"><label><input type="checkbox" checked={settings.sidePickEnabled !== false} onChange={(event) => setSettings({ ...settings, sidePickEnabled: event.target.checked })} /> Side selection</label><label><input type="checkbox" checked={settings.autoBanEnabled !== false} onChange={(event) => setSettings({ ...settings, autoBanEnabled: event.target.checked })} /> Turn timer</label></div><button className="dx-text-button" onClick={() => send("setGameSettings", settings)}>Apply draft rules</button></div></div>}<button className="dx-button dx-button-primary dx-start" disabled={!session.me?.isHost || !bothCaptains} onClick={() => send("startDraft")}>{!session.me?.isHost ? "Waiting for host" : bothCaptains ? "Launch map veto" : "Lock both captains first"}</button></section><TeamPanel side="B" session={session} send={send} /></div></main>;
}
