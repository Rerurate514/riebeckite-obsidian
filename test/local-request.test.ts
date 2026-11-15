import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { localBridgeRequest } from "../src/bridge/local-request";

test("sends Bridge requests directly to loopback without an Origin header", async (t) => {
  const server = createServer((request, response) => {
    assert.equal(request.headers.origin, undefined);
    assert.equal(request.headers["x-riebeckite-bridge-token"], "token");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ready: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const result = await localBridgeRequest({
    url: `http://127.0.0.1:${address.port}/__riebeckite/bridge/v1`,
    method: "GET",
    headers: { "x-riebeckite-bridge-token": "token" },
    throw: false,
  });

  assert.deepEqual(result, { status: 200, json: { ready: true } });
});

test("rejects non-loopback Bridge URLs", async () => {
  await assert.rejects(
    localBridgeRequest({
      url: "http://example.com/__riebeckite/bridge/v1",
      method: "GET",
      headers: {},
      throw: false,
    }),
  );
});
