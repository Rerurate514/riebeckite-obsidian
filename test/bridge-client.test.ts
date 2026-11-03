import assert from "node:assert/strict";
import test from "node:test";
import { BridgeClient, type BridgeRequest } from "../src/bridge/bridge-client";

const connectedStatus = {
  protocolVersion: 1,
  server: { id: "server", version: "0.0.38" },
  capabilities: ["status"],
  development: {
    available: true,
    revision: 1,
    build: { status: "unavailable" },
  },
  inspection: { available: false },
};

test("connects through the authenticated Bridge bootstrap", async () => {
  const requests: string[] = [];
  const request: BridgeRequest = async (input) => {
    requests.push(input.url);
    return response(
      input.url.endsWith("/bootstrap")
        ? { origin: "http://127.0.0.1:4567" }
        : connectedStatus,
    );
  };
  const client = new BridgeClient(request);

  const state = await client.connect("http://127.0.0.1:3000", "a".repeat(32));

  assert.equal(state.kind, "connected");
  assert.deepEqual(requests, [
    "http://127.0.0.1:3000/__riebeckite/bridge/bootstrap",
    "http://127.0.0.1:4567/__riebeckite/bridge/v1",
  ]);
});

test("rejects invalid Bridge responses", async () => {
  const client = new BridgeClient(async (input) =>
    response(
      input.url.endsWith("/bootstrap")
        ? { origin: "http://127.0.0.1:4567" }
        : {},
    ),
  );

  const state = await client.connect("http://127.0.0.1:3000", "a".repeat(32));

  assert.deepEqual(state, {
    kind: "error",
    message: "Bridge returned an invalid response.",
  });
});

test("shares concurrent connection requests", async () => {
  let calls = 0;
  const client = new BridgeClient(async (input) => {
    calls += 1;
    return response(
      input.url.endsWith("/bootstrap")
        ? { origin: "http://127.0.0.1:4567" }
        : connectedStatus,
    );
  });

  const [first, second] = await Promise.all([
    client.connect("http://127.0.0.1:3000", "a".repeat(32)),
    client.connect("http://127.0.0.1:3000", "a".repeat(32)),
  ]);

  assert.equal(first.kind, "connected");
  assert.equal(second.kind, "connected");
  assert.equal(calls, 2);
});

test("reports rejected pairing and incompatible protocol", async () => {
  const unauthorized = new BridgeClient(async () => response({}, 403));
  assert.equal(
    (await unauthorized.connect("http://127.0.0.1:3000", "a".repeat(32))).kind,
    "unauthorized",
  );

  const incompatible = new BridgeClient(async (input) =>
    input.url.endsWith("/bootstrap")
      ? response({ origin: "http://127.0.0.1:4567" })
      : response({}, 426),
  );
  assert.equal(
    (await incompatible.connect("http://127.0.0.1:3000", "a".repeat(32))).kind,
    "incompatible",
  );
});

test("times out and stays disconnected after disposal", async () => {
  const client = new BridgeClient(() => new Promise(() => {}), 1);
  assert.equal(
    (await client.connect("http://127.0.0.1:3000", "a".repeat(32))).kind,
    "unavailable",
  );
  client.dispose();
  assert.equal(client.getState().kind, "disconnected");
});

function response(json: unknown, status = 200) {
  return { status, json } as Awaited<ReturnType<BridgeRequest>>;
}
