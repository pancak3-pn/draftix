const assert = require("node:assert/strict");
const { connect, emit, startServer } = require("./helpers");

(async () => {
  const server = await startServer(3393, {
    ADMIN_STATS_TOKEN: "test-admin-token-that-is-longer-than-24-characters",
  });
  let client;
  try {
    client = await connect(server.baseUrl);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await emit(client, "createSession", { nickname: `Host ${attempt + 1}` });
      assert.equal(result.ok, true);
    }

    const blocked = await emit(client, "createSession", { nickname: "Spam" });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "Rate limit — slow down.");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`${server.baseUrl}/api/admin/stats`, {
        headers: { Authorization: "Bearer incorrect-token" },
      });
      assert.equal(response.status, 401);
    }
    const adminBlocked = await fetch(`${server.baseUrl}/api/admin/stats`, {
      headers: { Authorization: "Bearer incorrect-token" },
    });
    assert.equal(adminBlocked.status, 429);
    assert.equal((await adminBlocked.json()).error, "Too many sign-in attempts. Try again in 15 minutes.");

    console.log("PASS rate limits: room creation and admin attempts are blocked");
  } finally {
    client?.disconnect();
    await server.stop();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
