import assert from "node:assert/strict";
import test from "node:test";
import type {
  BridgeConnectionState,
  BridgeIdentity,
} from "../src/bridge/bridge-client";
import {
  checkSiteIdentity,
  classifyConnectionTest,
  validateContentMappings,
} from "../src/settings/connection-validation";
import type { ConnectionProfile } from "../src/settings/settings";

const identity: BridgeIdentity = {
  siteId: "site-one",
  siteName: "Site One",
  contentRootId: "content",
  contentSourceKind: "integrated",
};

const profile: ConnectionProfile = {
  id: "one",
  displayName: "One",
  mode: "custom-mapping",
  serverUrl: "http://127.0.0.1:3000",
  bridgeToken: "",
  contentMapping: [{ vaultFolder: "Sites/One", contentRootId: "content" }],
};

test("classifies connection test failures without exposing the token", () => {
  assert.deepEqual(
    classifyConnectionTest("https://example.com", { kind: "disconnected" }),
    { kind: "loopback" },
  );
  assert.deepEqual(
    classifyConnectionTest(profile.serverUrl, {
      kind: "unauthorized",
      message: "",
    }),
    { kind: "authentication" },
  );
  assert.deepEqual(
    classifyConnectionTest(profile.serverUrl, {
      kind: "incompatible",
      message: "",
    }),
    { kind: "protocol" },
  );
  assert.deepEqual(
    classifyConnectionTest(profile.serverUrl, {
      kind: "unavailable",
      message: "",
    }),
    { kind: "unreachable" },
  );
});

test("reports a successful connection identity", () => {
  const state: BridgeConnectionState = {
    kind: "connected",
    status: {
      protocolVersion: 1,
      server: { id: "server", version: "1" },
      capabilities: [],
      development: {
        available: true,
        revision: 1,
        build: { status: "unavailable" },
      },
      inspection: { available: false },
      identity,
    },
  };
  assert.deepEqual(classifyConnectionTest(profile.serverUrl, state), {
    kind: "success",
    identity,
  });
});

test("validates missing and duplicate mapping folders", () => {
  const result = validateContentMappings(
    [
      profile,
      {
        ...profile,
        id: "two",
        displayName: "Two",
        contentMapping: [{ vaultFolder: "Missing", contentRootId: "other" }],
      },
      { ...profile, id: "three" },
    ],
    new Set(["Sites/One"]),
  );
  assert.deepEqual(result.errors, [
    'Two: Vault folder "Missing" does not exist.',
  ]);
  assert.deepEqual(result.warnings, [
    'Vault folder "Sites/One" is used by multiple mappings.',
  ]);
});

test("checks matching, mismatched, and unsupported site identity", () => {
  assert.equal(checkSiteIdentity({ siteId: "site-one" }, identity), "matched");
  assert.equal(checkSiteIdentity({ siteId: "other" }, identity), "mismatch");
  assert.equal(
    checkSiteIdentity({ siteId: "site-one" }, undefined),
    "unsupported",
  );
});
