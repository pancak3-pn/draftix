const assert = require("node:assert/strict");
const { connect, delay, emit, nextState, startServer } = require("./helpers");

(async () => {
  const server = await startServer(3391);
  let first;
  let resumed;
  try {
    first = await connect(server.baseUrl);
    const initialState = nextState(first, (state) => state.phase === "lobby");
    const created = await emit(first, "createSession", { nickname: "Host" });
    assert.equal(created.ok, true);
    assert.match(created.token, /^[A-Za-z0-9_-]{16,64}$/);
    const state = await initialState;
    assert.equal(state.me.isHost, true);
    first.disconnect();
    await delay(150);

    resumed = await connect(server.baseUrl);
    const resumedStatePromise = nextState(resumed, (value) => value.code === created.code);
    const joined = await emit(resumed, "joinSession", {
      code: created.code,
      nickname: "Host",
      token: created.token,
    });
    assert.equal(joined.ok, true);
    assert.equal(joined.resumed, true);
    assert.equal(joined.token, created.token);
    const resumedState = await resumedStatePromise;
    assert.equal(resumedState.me.isHost, true);
    assert.equal(resumedState.me.id, resumed.id);
    console.log("PASS resume: host identity and token survive reconnect");
  } finally {
    first?.disconnect();
    resumed?.disconnect();
    await server.stop();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
