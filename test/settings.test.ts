import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSettings,
  mapContentPath,
  mapVaultPath,
  parseSettings,
} from "../src/settings/settings";

test("returns defaults for missing or malformed settings", () => {
  assert.deepEqual(parseSettings(null), defaultSettings);
  assert.deepEqual(
    parseSettings({ serverUrl: "file:///vault" }),
    defaultSettings,
  );
  assert.deepEqual(
    parseSettings({ serverUrl: "https://example.com", bridgeToken: "secret" }),
    defaultSettings,
  );
});

test("accepts and normalizes a local server URL", () => {
  const settings = parseSettings({
    serverUrl: "http://127.0.0.1:3000/",
    bridgeToken: "a".repeat(32),
  });
  assert.equal(settings.serverUrl, "http://127.0.0.1:3000");
  assert.equal(settings.bridgeToken, "a".repeat(32));
  assert.deepEqual(settings.profiles, [
    {
      id: "default",
      displayName: "Riebeckite site",
      mode: "integrated",
      serverUrl: "http://127.0.0.1:3000",
      bridgeToken: "a".repeat(32),
    },
  ]);
});

test("keeps multiple valid profiles and selects the active profile", () => {
  const settings = parseSettings({
    profiles: [
      {
        id: "one",
        displayName: "One",
        mode: "separate-git",
        serverUrl: "http://127.0.0.1:3000",
        bridgeToken: "one",
        vaultFolder: "Notes\\Site",
      },
      {
        id: "two",
        displayName: "Two",
        mode: "custom-mapping",
        serverUrl: "http://localhost:4000",
        bridgeToken: "two",
      },
    ],
    activeProfileId: "two",
  });
  assert.equal(settings.activeProfileId, "two");
  assert.equal(settings.serverUrl, "http://localhost:4000");
  assert.equal(settings.profiles[0]?.vaultFolder, "Notes/Site");
});

test("maps only the configured vault folder for separate content", () => {
  const profile = {
    id: "site",
    displayName: "Site",
    mode: "separate-local" as const,
    serverUrl: "http://127.0.0.1:3000",
    bridgeToken: "",
    vaultFolder: "Sites/Main",
  };
  assert.equal(
    mapVaultPath(profile, "Sites/Main/notes/hello.md"),
    "notes/hello.md",
  );
  assert.equal(mapVaultPath(profile, "Inbox/hello.md"), undefined);
  assert.equal(
    mapContentPath(profile, "notes/hello.md"),
    "Sites/Main/notes/hello.md",
  );
});
