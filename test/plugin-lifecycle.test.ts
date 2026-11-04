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

test("plugin does not connect before managed development is ready", () => {
  const onload = bodyOf(mainSource, "async onload()", "onunload()");
  assert.doesNotMatch(onload, /connectBridge/);
  assert.doesNotMatch(onload, /polling\.start/);
});

test("site switch stops the managed process before changing settings", () => {
  const switchSite = bodyOf(
    mainSource,
    "async switchSite(",
    "async removeSite(",
  );
  const stop = switchSite.indexOf("await this.stopDev()");
  const update = switchSite.indexOf("await this.updateSettings(");

  assert.ok(stop >= 0, "switchSite must stop the managed process");
  assert.ok(stop < update, "the process must stop before the site changes");
});
