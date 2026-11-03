import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings, parseSettings } from "../src/settings/settings";

test("returns defaults for missing or malformed settings", () => {
  assert.deepEqual(parseSettings(null), defaultSettings);
  assert.deepEqual(
    parseSettings({ serverUrl: "file:///vault" }),
    defaultSettings,
  );
});

test("accepts and normalizes a local server URL", () => {
  assert.deepEqual(parseSettings({ serverUrl: "http://127.0.0.1:3000/" }), {
    serverUrl: "http://127.0.0.1:3000",
  });
});
