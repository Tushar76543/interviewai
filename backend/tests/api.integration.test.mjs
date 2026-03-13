import test from "node:test";
import assert from "node:assert/strict";

let appPromise = null;

const loadApp = async () => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-jwt-secret-minimum-32-characters-long";
  }

  if (!appPromise) {
    appPromise = import("../dist/app.js").then((module) => module.default);
  }

  return appPromise;
};

const startServer = async () => {
  const app = await loadApp();

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
};

test("GET /health responds with ok payload", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, "ok");
    assert.ok(typeof payload.timestamp === "string");
  } finally {
    server.close();
  }
});

test("GET /api/auth/csrf issues csrf cookie", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/auth/csrf`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.ok(typeof payload.csrfToken === "string");

    const cookies = response.headers.get("set-cookie") || "";
    assert.match(cookies, /csrf_token=/i);
  } finally {
    server.close();
  }
});

test("GET /api/metrics returns route latency snapshot", async () => {
  const { server, baseUrl } = await startServer();
  try {
    await fetch(`${baseUrl}/health`);
    const response = await fetch(`${baseUrl}/api/metrics`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.ok(Array.isArray(payload.routes));
    assert.ok(typeof payload.aiResilience === "object");
  } finally {
    server.close();
  }
});
