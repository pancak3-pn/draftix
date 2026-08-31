import { useEffect, useRef, useState } from "react";

function Logo() {
  return <a className="dx-logo" href="/" aria-label="Draftix home"><img src="/images/draftix.png" alt="" /><strong>DRAFT<span>IX</span></strong></a>;
}

function SelectionGrid({ items, selected, onPick, disabled, kind }) {
  return <div className={`dx-selection-grid is-${kind}`}>{items.map((item) => {
    const banned = selected.includes(item.uuid);
    return <button type="button" key={item.uuid} className={banned ? "is-banned" : ""} disabled={disabled || banned} aria-label={banned ? `${item.name}, banned` : `Ban ${item.name}`} onClick={() => onPick(item.uuid)}><img src={item.image} alt="" loading="lazy" /><span>{item.name}</span>{banned && <small>Locked out</small>}</button>;
  })}</div>;
}

export default function DraftBoard({ session, client, connection }) {
  const [seconds, setSeconds] = useState(null);
  const [message, setMessage] = useState("");
  const [musicMuted, setMusicMuted] = useState(false);
  const previousPhase = useRef(session.phase);
  const musicRef = useRef(null);
  const send = (event, payload = {}) => client?.socket.emit(event, { code: session.code, ...payload });
  const maps = session.catalog?.maps || [];
  const agents = session.catalog?.agents || [];
  const selectedMaps = session.mapBans || [];
  const selectedAgents = session.agentBans || [];
  const isMyTurn = session.me?.isCaptain && session.me?.myTeam === session.currentTurn;
  const canPick = isMyTurn && (session.phase === "map_ban" || session.phase === "agent_ban");

  useEffect(() => {
    if (!session.turnEndsAt || !["map_ban", "agent_ban"].includes(session.phase)) {
      setSeconds(null);
      return undefined;
    }
    const tick = () => setSeconds(Math.max(0, Math.ceil((session.turnEndsAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [session.turnEndsAt, session.phase]);

  useEffect(() => {
    if (previousPhase.current === session.phase) return;
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = session.phase === "done" ? 660 : 440;
      gain.gain.value = 0.035;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
    } catch { /* Audio can be blocked until the first user interaction. */ }
    previousPhase.current = session.phase;
  }, [session.phase]);

  useEffect(() => {
    if (musicRef.current) musicRef.current.muted = musicMuted;
  }, [musicMuted]);

  useEffect(() => {
    const audio = new Audio("/music/bg-music.mp3");
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.24;
    musicRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      musicRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return undefined;

    const isBanPhase = session.phase === "map_ban" || session.phase === "agent_ban";
    if (!isBanPhase) {
      audio.pause();
      return undefined;
    }

    let waitingForInteraction = false;
    const retryPlayback = () => {
      audio.play().then(removeRetryListeners).catch(() => {});
    };
    const removeRetryListeners = () => {
      if (!waitingForInteraction) return;
      waitingForInteraction = false;
      window.removeEventListener("pointerdown", retryPlayback);
      window.removeEventListener("keydown", retryPlayback);
    };

    audio.play().catch(() => {
      waitingForInteraction = true;
      window.addEventListener("pointerdown", retryPlayback, { once: true });
      window.addEventListener("keydown", retryPlayback, { once: true });
    });

    return removeRetryListeners;
  }, [session.phase]);

  function leave() {
    client?.socket.emit("leaveSession", { code: session.code }, () => { window.location.href = "/app"; });
  }

  function downloadSummary() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200; canvas.height = 700;
    const context = canvas.getContext("2d");
    context.fillStyle = "#070a10"; context.fillRect(0, 0, 1200, 700);
    context.fillStyle = "#e83f4e"; context.font = "700 32px Arial"; context.fillText("DRAFTIX", 64, 76);
    context.fillStyle = "#f2f3f5"; context.font = "700 48px Arial"; context.fillText(session.selectedMap?.name || "Draft result", 64, 160);
    context.fillStyle = "#9299a8"; context.font = "24px Arial"; context.fillText(`${session.teamNames?.A || "Team A"} vs ${session.teamNames?.B || "Team B"}`, 64, 210);
    context.fillText(`Opening side: ${session.selectedSide || "Not selected"}`, 64, 280);
    context.fillText(`Map bans: ${selectedMaps.length}`, 64, 330);
    context.fillText(`Agent bans: ${selectedAgents.length}`, 64, 380);
    context.font = "18px Arial"; context.fillText(`Room ${session.code} | draftix.tech`, 64, 630);
    const link = document.createElement("a");
    link.download = `draftix-${session.code}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function sendChat(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    send("chatMessage", { text });
    setMessage("");
  }

  const phaseLabel = session.phase === "map_ban" ? "Map veto" : session.phase === "side_pick" ? "Side pick" : session.phase === "agent_ban" ? "Agent bans" : "Complete";
  const turnTeam = session.currentTurn === "A" ? session.teamNames?.A : session.teamNames?.B;
  const status = session.phase === "done" ? "Ready to play" : session.phase === "side_pick" ? `${session.sidePickerTeam === "A" ? session.teamNames?.A : session.teamNames?.B} chooses the opening side` : isMyTurn ? "Your turn" : `Waiting for ${turnTeam}`;
  const pool = session.phase === "agent_ban" ? agents : maps;
  const selected = session.phase === "agent_ban" ? selectedAgents : selectedMaps;
  const kind = session.phase === "agent_ban" ? "agents" : "maps";
  const phases = ["map_ban", "side_pick", "agent_ban", "done"];
  const phaseIndex = phases.indexOf(session.phase);
  const isBanPhase = session.phase === "map_ban" || session.phase === "agent_ban";

  return <main className={`dx-app dx-phase-${session.phase}${canPick ? " is-my-turn" : ""}`}><header className="dx-appbar"><Logo /><div className="dx-phase"><strong>{phaseLabel}</strong><span>Room {session.code}</span></div><div className="dx-app-actions"><span className={`dx-live is-${connection}`}><i />{connection}</span>{isBanPhase && <button className="dx-audio-toggle" aria-pressed={musicMuted} onClick={() => setMusicMuted((value) => !value)}>{musicMuted ? "Sound off" : "Sound on"}</button>}{session.ops?.canUndo && <button onClick={() => send("undoDraftAction")}>Undo</button>}{session.ops?.canResetToLobby && <button onClick={() => send("resetDraftToLobby")}>Reset</button>}{session.phase === "done" && <button onClick={downloadSummary}>Export</button>}<button onClick={leave}>Leave</button></div></header><nav className="dx-phase-rail" aria-label="Draft progress">{[["Map veto","map_ban"],["Side","side_pick"],["Agents","agent_ban"],["Match ready","done"]].map(([label, phase], index) => <span key={phase} className={index === phaseIndex ? "is-active" : index < phaseIndex ? "is-complete" : ""}><i>{String(index + 1).padStart(2,"0")}</i>{label}</span>)}</nav><div className="dx-draft-shell"><section className="dx-draft-main"><header className="dx-turn"><div><span className="dx-turn-label">{canPick ? "Action required" : "Live draft"}</span><h1>{status}</h1><p>{canPick ? "Lock one option before the timer expires." : "The board updates for everyone in real time."}</p></div>{seconds !== null && <div className="dx-clock"><small>Turn timer</small><time>{String(seconds).padStart(2, "0")}</time></div>}</header>{session.phase === "side_pick" && <section className="dx-side-pick"><span>Map locked</span><h2>Open {session.selectedMap?.name} on</h2><div><button className="dx-button dx-button-primary" disabled={!session.me?.isCaptain || session.me.myTeam !== session.sidePickerTeam} onClick={() => send("pickSide", { side: "attack" })}>Attack</button><button className="dx-button dx-button-secondary" disabled={!session.me?.isCaptain || session.me.myTeam !== session.sidePickerTeam} onClick={() => send("pickSide", { side: "defense" })}>Defense</button></div></section>}{["map_ban", "agent_ban"].includes(session.phase) && <section className="dx-pool"><header><div><span>{session.phase === "map_ban" ? "Map pool" : "Agent roster"}</span><h2>{session.phase === "map_ban" ? "Choose a map to ban" : "Choose an agent to ban"}</h2></div><p><b>{selected.length}</b> locked</p></header><SelectionGrid items={pool} selected={selected} disabled={!canPick} kind={kind} onPick={(uuid) => send(session.phase === "map_ban" ? "banMap" : "banAgent", { uuid })} /></section>}{session.phase === "done" && <section className="dx-complete"><div><span>Draft complete</span><h2>{session.selectedMap?.name || "Map decided"}</h2><p>{session.selectedSide ? `Opening side: ${session.selectedSide}` : "The draft is locked."}</p></div><div><button className="dx-button dx-button-secondary" onClick={downloadSummary}>Export result</button>{session.ops?.canRematch && <button className="dx-button dx-button-primary" onClick={() => send("rematchDraft")}>Run it back</button>}</div></section>}</section><aside className="dx-chat"><header><div><small>Squad comms</small><h2>Room chat</h2></div><span>{session.chat?.length || 0}/50</span></header><div className="dx-chat-log">{session.chat?.length ? session.chat.map((item) => <article key={item.id} className={item.fromId === session.me?.id ? "is-mine" : ""}><strong>{item.fromName}</strong><p>{item.text}</p></article>) : <div className="dx-chat-empty"><span>COMMS</span><p>Messages stay inside this room.</p></div>}</div><form onSubmit={sendChat}><input value={message} maxLength={240} onChange={(event) => setMessage(event.target.value)} placeholder="Message the room" aria-label="Room message" /><button type="submit">Send</button></form></aside></div></main>;
}
