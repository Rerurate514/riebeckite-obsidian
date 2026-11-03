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

test("resolves pages from the authenticated private origin", async () => {
  const client = new BridgeClient(async (input) => {
    if (input.url.endsWith("/bootstrap"))
      return response({ origin: "http://127.0.0.1:4567" });
    if (input.url.endsWith("/v1")) return response(connectedStatus);
    return response({
      status: "resolved",
      source: "notes/hello.md",
      page: "/custom/hello/",
      visibility: "unlisted",
      routable: true,
      discoverable: false,
      locale: "ja",
      publishAt: null,
      revision: 1,
      productionUrl: "https://example.com/custom/hello/",
    });
  });
  await client.connect("http://127.0.0.1:3000", "a".repeat(32));

  const result = await client.resolvePage(
    "http://127.0.0.1:3000",
    "a".repeat(32),
    "notes/hello.md",
  );

  assert.deepEqual(result, {
    kind: "resolved",
    previewUrl: "http://127.0.0.1:3000/custom/hello/",
    page: {
      source: "notes/hello.md",
      page: "/custom/hello/",
      visibility: "unlisted",
      routable: true,
      discoverable: false,
      locale: "ja",
      publishAt: null,
      revision: 1,
      productionUrl: "https://example.com/custom/hello/",
    },
  });
});

test("does not let a disconnected request overwrite current state", async () => {
  let resolveRequest: (() => void) | undefined;
  const client = new BridgeClient(
    () =>
      new Promise((resolve) => {
        resolveRequest = () =>
          resolve(response({ origin: "http://127.0.0.1:4567" }));
      }),
  );
  const connecting = client.connect("http://127.0.0.1:3000", "a".repeat(32));
  client.disconnect();
  resolveRequest?.();
  await connecting;
  assert.equal(client.getState().kind, "disconnected");
});

function response(json: unknown, status = 200) {
  return { status, json } as Awaited<ReturnType<BridgeRequest>>;
}
