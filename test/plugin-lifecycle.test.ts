import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainSource = await readFile(
  new URL("../src/main.ts", import.meta.url),
  "utf8",
);

function bodyOf(
  source: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing ${startMarker}`);
  assert.ok(end > start, `missing ${endMarker}`);
  return source.slice(start, end);
}

test("plugin starts polling from onload", () => {
  const onload = bodyOf(mainSource, "async onload()", "onunload()");
  assert.match(onload, /this\.polling\.start\(\)/);
});

test("profile switch stops the previous polling before changing settings", () => {
  const switchProfile = bodyOf(
    mainSource,
    "async switchProfile(",
    "disconnectBridge(",
  );
  const stop = switchProfile.indexOf("this.polling.stop()");
  const update = switchProfile.indexOf("await this.updateSettings(");

  assert.ok(stop >= 0, "switchProfile must stop polling");
  assert.ok(stop < update, "polling must stop before the profile changes");
});
