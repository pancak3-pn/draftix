const { spawn } = require("node:child_process");
const { io } = require("socket.io-client");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before becoming healthy (${child.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return response.json();
    } catch (_) {}
    await delay(100);
  }
  throw new Error("Timed out waiting for test server");
}

async function startServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      DRAFTIX_TEST_CATALOG: "1",
      RECONNECT_GRACE_MS: "5000",
      TURN_TIMEOUT_MS: "60000",
      ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(baseUrl, child);
  } catch (error) {
    child.kill();
    throw new Error(`${error.message}\n${output}`);
  }
  return {
    baseUrl,
    child,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      const deadline = Date.now() + 3000;
      while (child.exitCode === null && Date.now() < deadline) await delay(50);
      if (child.exitCode === null) child.kill();
    },
  };
}

function connect(baseUrl) {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 4000,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event} acknowledgement`)), 4000);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function nextState(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("state", onState);
      reject(new Error("Timed out waiting for session state"));
    }, 4000);
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off("state", onState);
      resolve(state);
    }
    socket.on("state", onState);
  });
}

module.exports = { connect, delay, emit, nextState, startServer };
