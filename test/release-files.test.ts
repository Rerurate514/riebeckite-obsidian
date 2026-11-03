import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readProjectMetadata,
  validateManifest,
} from "../scripts/check-manifest.mjs";
import { validateReleaseArtifact } from "../scripts/verify-release.mjs";

test("project metadata has a valid Obsidian manifest and aligned versions", async () => {
  const [manifest, packageJson, versions] = await readProjectMetadata();
  assert.deepEqual(validateManifest(manifest, packageJson, versions), []);
});

test("release validation accepts required non-empty plugin files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "riebeckite-obsidian-"));
  await writeFile(join(directory, "manifest.json"), "{}");
  await writeFile(join(directory, "main.js"), 'require("obsidian");');

  assert.deepEqual(await validateReleaseArtifact(directory), []);
});
