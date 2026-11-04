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

test("reads publication data only when the server advertises its capability", async () => {
  const client = new BridgeClient(async (input) => {
    if (input.url.endsWith("/bootstrap"))
      return response({ origin: "http://127.0.0.1:4567" });
    if (input.url.endsWith("/v1"))
      return response({ ...connectedStatus, capabilities: ["publication"] });
    return response({
      status: "resolved",
      entry: {
        source: { path: "notes/hello.md" },
        permalink: "/hello/",
        locale: "ja",
      },
      publication: {
        visibility: "scheduled",
        routable: false,
        discoverable: false,
        publishAt: "2026-11-05T00:00:00.000Z",
        publicLocation: { permalink: "/hello/" },
        redirects: [],
        reasons: ["publishAt is after the build time"],
      },
      revision: 2,
    });
  });
  await client.connect("http://127.0.0.1:3000", "a".repeat(32));

  const result = await client.inspectPublication(
    "a".repeat(32),
    "notes/hello.md",
  );

  assert.deepEqual(result, {
    kind: "resolved",
    revision: 2,
    value: {
      source: "notes/hello.md",
      permalink: "/hello/",
      locale: "ja",
      visibility: "scheduled",
      routable: false,
      discoverable: false,
      publishAt: "2026-11-05T00:00:00.000Z",
      publicLocation: { permalink: "/hello/" },
      canonicalUrl: null,
      redirects: [],
      reasons: ["publishAt is after the build time"],
      revision: 2,
    },
  });
});

test("keeps no-source diagnostics readable when optional fields are omitted", async () => {
  const client = new BridgeClient(async (input) => {
    if (input.url.endsWith("/bootstrap"))
      return response({ origin: "http://127.0.0.1:4567" });
    if (input.url.endsWith("/v1"))
      return response({ ...connectedStatus, capabilities: ["diagnostics"] });
    return response({
      status: "resolved",
      diagnostics: [
        {
          code: "orphan-note",
          severity: "info",
          message: "Not linked",
          category: "content",
        },
      ],
      revision: 3,
    });
  });
  await client.connect("http://127.0.0.1:3000", "a".repeat(32));

  const result = await client.inspectDiagnostics(
    "a".repeat(32),
    "notes/hello.md",
  );

  assert.deepEqual(result, {
    kind: "resolved",
    revision: 3,
    value: [
      {
        code: "orphan-note",
        severity: "info",
        message: "Not linked",
        category: "content",
        source: undefined,
        related: [],
        fix: undefined,
      },
    ],
  });
});

test("refreshes a connected Bridge status without bootstrapping again", async () => {
  let revision = 1;
  const requests: string[] = [];
  const client = new BridgeClient(async (input) => {
    requests.push(input.url);
    return input.url.endsWith("/bootstrap")
      ? response({ origin: "http://127.0.0.1:4567" })
      : response({
          ...connectedStatus,
          development: { ...connectedStatus.development, revision: revision++ },
        });
  });
  await client.connect("http://127.0.0.1:3000", "a".repeat(32));

  const state = await client.refreshStatus("a".repeat(32));

  assert.equal(state.kind, "connected");
  assert.equal(
    state.kind === "connected" && state.status.development.revision,
    2,
  );
  assert.equal(requests.filter((url) => url.endsWith("/bootstrap")).length, 1);
});

test("reads build impact only when advertised by the Bridge", async () => {
  const client = new BridgeClient(async (input) => {
    if (input.url.endsWith("/bootstrap"))
      return response({ origin: "http://127.0.0.1:4567" });
    if (input.url.endsWith("/v1"))
      return response({ ...connectedStatus, capabilities: ["build-impact"] });
    return response({
      status: "resolved",
      impact: {
        completeness: "complete",
        affectedOutputs: [{ path: "hello/index.html" }],
        unchangedOutputs: [],
        removedOutputs: [],
        fullRegenerationRequired: false,
      },
      revision: 1,
    });
  });
  await client.connect("http://127.0.0.1:3000", "a".repeat(32));
  const result = await client.inspectImpact("a".repeat(32), "notes/hello.md");
  assert.equal(result.kind, "resolved");
  assert.equal(
    result.kind === "resolved" && result.value.affectedOutputs[0]?.path,
    "hello/index.html",
  );
});

test("submits reviewed mutation plans with both Bridge tokens", async () => {
  let mutationRequest: Parameters<BridgeRequest>[0] | undefined;
  const client = new BridgeClient(async (input) => {
    if (input.url.endsWith("/bootstrap"))
      return response({ origin: "http://127.0.0.1:4567" });
    if (input.url.endsWith("/v1")) return response(connectedStatus);
    mutationRequest = input;
    return response({ id: "plan", changes: [], warnings: [] });
  });
  await client.connect("http://127.0.0.1:3000", "a".repeat(32));

  const result = await client.planFrontmatter(
    "a".repeat(32),
    "b".repeat(32),
    "notes/hello.md",
    { visibility: "draft" },
    [],
  );

  assert.equal(result.kind, "resolved");
  assert.equal(
    mutationRequest?.headers["x-riebeckite-bridge-token"],
    "a".repeat(32),
  );
  assert.equal(
    mutationRequest?.headers["x-riebeckite-bridge-mutation-token"],
    "b".repeat(32),
  );
  assert.equal(
    mutationRequest?.body,
    JSON.stringify({
      operations: [
        {
          kind: "frontmatter",
          path: "notes/hello.md",
          set: { visibility: "draft" },
          remove: [],
        },
      ],
    }),
  );
});

function response(json: unknown, status = 200) {
  return { status, json } as Awaited<ReturnType<BridgeRequest>>;
}
