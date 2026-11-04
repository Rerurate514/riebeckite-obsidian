import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [controller, workspace, main] = await Promise.all(
  [
    "../src/dev/dev-server-controller.ts",
    "../src/workspace/riebeckite-workspace-view.ts",
    "../src/main.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")) as [
    Promise<string>,
    Promise<string>,
    Promise<string>,
  ],
);

test("managed development uses a runtime environment token without CLI exposure", () => {
  assert.match(controller, /RIEBECKITE_BRIDGE_TOKEN: this\.token/);
  assert.match(controller, /RIEBECKITE_MANAGED_DEV_CONTROL_FD: "3"/);
  assert.match(controller, /spawn\("node", \[command, "dev"\]/);
  assert.match(controller, /stdio: \["ignore", "pipe", "pipe", "pipe"\]/);
  assert.doesNotMatch(controller, /bridge-token/);
  assert.match(controller, /child\.stdio\[3\].*on\("data"/);
  assert.match(controller, /\[redacted\]/);
});

test("managed development stops only the owned Windows process tree", () => {
  assert.match(controller, /"taskkill"/);
  assert.match(controller, /String\(child\.pid\)/);
  assert.doesNotMatch(controller, /netstat|Get-NetTCPConnection|lsof/);
});

test("workspace owns the managed development and active-note tabs", () => {
  assert.match(workspace, /workspaceViewType = "riebeckite-workspace"/);
  assert.match(workspace, /\{ id: "logs", label: "Logs" \}/);
  assert.match(workspace, /this\.plugin\.editor\.publication\(file\.path\)/);
  assert.match(workspace, /this\.plugin\.editor\.diagnostics\(file\.path\)/);
  assert.match(workspace, /this\.plugin\.editor\.impact\(file\.path\)/);
  assert.match(main, /id: "start-dev"/);
  assert.match(main, /id: "stop-dev"/);
  assert.match(main, /getLeavesOfType\(workspaceViewType\)/);
});
