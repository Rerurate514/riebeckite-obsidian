import assert from "node:assert/strict";
import test from "node:test";
import { BridgeClient } from "../src/bridge/bridge-client";
import { EditorApi } from "../src/bridge/editor-api";

test("does not submit mutations when the active identity is mismatched", async () => {
  let requests = 0;
  const bridge = new BridgeClient(async () => {
    requests += 1;
    return { status: 500, json: {} };
  });
  const editor = new EditorApi(
    bridge,
    () => "a".repeat(32),
    () => "b".repeat(32),
    undefined,
    () => false,
  );

  assert.deepEqual(
    await editor.planFrontmatter("notes/hello.md", { visibility: "draft" }, []),
    { kind: "unavailable" },
  );
  assert.deepEqual(await editor.applyMutation("plan"), { kind: "unavailable" });
  assert.equal(requests, 0);
});
