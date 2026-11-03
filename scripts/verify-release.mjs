import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
export async function validateReleaseArtifact(directory = ".") {
  const requiredFiles = ["main.js", "manifest.json"];
  const errors = [];
  for (const file of requiredFiles) {
    try {
      await access(`${directory}/${file}`, constants.R_OK);
    } catch {
      errors.push(`${file} is missing from the release artifact`);
    }
  }
  if (errors.length > 0) return errors;

  const main = await readFile(`${directory}/main.js`, "utf8");
  if (main.length === 0) errors.push("main.js is empty");
  if (!main.includes('require("obsidian")')) {
    errors.push("main.js does not retain the Obsidian runtime dependency");
  }
  return errors;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const errors = await validateReleaseArtifact();
  if (errors.length > 0) throw new Error(errors.join("\n"));
}
