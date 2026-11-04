import assert from "node:assert/strict";
import test from "node:test";
import { parseManagedDevEvent } from "../src/dev/dev-server-controller";

const sessionId = "3d4c15af-35dc-4a06-9c06-734101b5ba55";

test("accepts a valid managed development ready event", () => {
  assert.deepEqual(
    parseManagedDevEvent(
      JSON.stringify({
        type: "ready",
        protocolVersion: 1,
        sessionId,
        siteId: "site-id",
        previewOrigin: "http://127.0.0.1:5173",
        capabilities: ["bridge-v1"],
      }),
    ),
    {
      type: "ready",
      protocolVersion: 1,
      sessionId,
      siteId: "site-id",
      previewOrigin: "http://127.0.0.1:5173",
      capabilities: ["bridge-v1"],
    },
  );
});

test("rejects malformed managed development events", () => {
  assert.equal(parseManagedDevEvent("not json"), undefined);
  assert.equal(
    parseManagedDevEvent(
      JSON.stringify({ type: "ready", protocolVersion: 2, sessionId }),
    ),
    undefined,
  );
  assert.equal(
    parseManagedDevEvent(
      JSON.stringify({
        type: "ready",
        protocolVersion: 1,
        sessionId,
        capabilities: [],
      }),
    ),
    undefined,
  );
});
