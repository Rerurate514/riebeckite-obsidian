import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSettings,
  mapContentPath,
  mapVaultPath,
  parseSettings,
} from "../src/settings/settings";

test("discards legacy credentials while retaining safe site selection data", () => {
  const settings = parseSettings({
    profiles: [
      {
        id: "site",
        displayName: "Docs",
        siteProjectDirectory: "C:\\Sites\\docs",
        serverUrl: "http://127.0.0.1:3000",
        bridgeToken: "secret",
        mutationToken: "another-secret",
        vaultFolder: "Notes\\Docs",
      },
    ],
    activeProfileId: "site",
  });
  assert.deepEqual(settings, {
    sites: [
      {
        id: "site",
        displayName: "Docs",
        projectDirectory: "C:\\Sites\\docs",
        vaultFolder: "Notes/Docs",
        siteId: undefined,
        contentRootId: undefined,
        managedDevTrusted: false,
      },
    ],
    activeSiteId: "site",
  });
  assert.doesNotMatch(JSON.stringify(settings), /secret/);
});

test("rejects malformed site settings", () => {
  assert.deepEqual(parseSettings(null), defaultSettings);
  assert.deepEqual(parseSettings({ sites: [{ id: "site" }] }), defaultSettings);
});

test("maps the whole vault by default and a configured folder when present", () => {
  const site = {
    id: "site",
    displayName: "Docs",
    projectDirectory: "C:\\Sites\\docs",
    vaultFolder: "Notes/Site",
  };
  assert.equal(mapVaultPath(undefined, "notes/hello.md"), "notes/hello.md");
  assert.equal(
    mapVaultPath(site, "Notes/Site/notes/hello.md"),
    "notes/hello.md",
  );
  assert.equal(mapVaultPath(site, "Inbox/hello.md"), undefined);
  assert.equal(
    mapContentPath(site, "notes/hello.md"),
    "Notes/Site/notes/hello.md",
  );
});
