import { readFile } from "node:fs/promises";

const pluginId = /^[a-z0-9-]+$/;
const version = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function validateManifest(manifest, packageJson, versions) {
  const errors = [];
  if (!pluginId.test(manifest.id ?? "")) errors.push("manifest.id is invalid");
  if (!manifest.name) errors.push("manifest.name is required");
  if (!version.test(manifest.version ?? "")) {
    errors.push("manifest.version must be a semantic version");
  }
  if (!version.test(manifest.minAppVersion ?? "")) {
    errors.push("manifest.minAppVersion must be a semantic version");
  }
  if (typeof manifest.isDesktopOnly !== "boolean") {
    errors.push("manifest.isDesktopOnly must be a boolean");
  }
  if (manifest.version !== packageJson.version) {
    errors.push("manifest.json and package.json versions differ");
  }
  if (versions[manifest.version] !== manifest.minAppVersion) {
    errors.push(
      "versions.json does not map the manifest version to minAppVersion",
    );
  }
  return errors;
}

export async function readProjectMetadata(directory = ".") {
  const readJson = async (file) =>
    JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
  if (directory !== ".")
    throw new Error("A custom directory is not supported.");
  return Promise.all([
    readJson("manifest.json"),
    readJson("package.json"),
    readJson("versions.json"),
  ]);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [manifest, packageJson, versions] = await readProjectMetadata();
  const errors = validateManifest(manifest, packageJson, versions);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}
