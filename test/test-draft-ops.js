const assert = require("node:assert/strict");
const { connect, delay, emit, startServer } = require("./helpers");

(async () => {
  const server = await startServer(3392);
  let host;
  let guest;
  try {
    host = await connect(server.baseUrl);
    guest = await connect(server.baseUrl);
    let latest;
    host.on("state", (state) => { latest = state; });

    const created = await emit(host, "createSession", { nickname: "Alpha" });
    assert.equal(created.ok, true);
    assert.equal((await emit(guest, "joinSession", { code: created.code, nickname: "Bravo" })).ok, true);
    assert.equal((await emit(host, "claimCaptain", { code: created.code, team: "A" })).ok, true);
    assert.equal((await emit(guest, "claimCaptain", { code: created.code, team: "B" })).ok, true);
    assert.equal((await emit(host, "setGameSettings", {
      code: created.code,
      draftPreset: "quick",
      agentBanCount: 0,
      turnTimeoutMs: 60000,
      autoBanEnabled: false,
      sidePickEnabled: false,
    })).ok, true);
    assert.equal((await emit(host, "startDraft", { code: created.code })).ok, true);
    await delay(80);
    assert.equal(latest.phase, "map_ban");

    const wrongSocket = latest.currentTurn === "A" ? guest : host;
    const rejected = await emit(wrongSocket, "banMap", { code: created.code, uuid: latest.catalog.maps[0].uuid });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error, "Not your turn");

    while (latest.phase === "map_ban") {
      const actingSocket = latest.currentTurn === "A" ? host : guest;
      const target = latest.catalog.maps.find((map) => !latest.mapBans.includes(map.uuid));
      const result = await emit(actingSocket, "banMap", { code: created.code, uuid: target.uuid });
      assert.equal(result.ok, true);
      await delay(60);
    }

    assert.equal(latest.phase, "done");
    assert.ok(latest.selectedMap?.uuid);
    assert.equal(latest.mapBans.length, 2);
    assert.equal((await emit(host, "resetDraftToLobby", { code: created.code })).ok, true);
    await delay(60);
    assert.equal(latest.phase, "lobby");
    console.log("PASS draft ops: authorization, map veto, completion, and reset");
  } finally {
    host?.disconnect();
    guest?.disconnect();
    await server.stop();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
