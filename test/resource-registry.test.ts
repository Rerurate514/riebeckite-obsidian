import assert from "node:assert/strict";
import test from "node:test";
import { ResourceRegistry } from "../src/lifecycle/resource-registry";

test("disposes registered resources once in reverse registration order", () => {
  const calls: string[] = [];
  const registry = new ResourceRegistry();
  registry.add({ dispose: () => calls.push("first") });
  registry.add({ dispose: () => calls.push("second") });

  registry.dispose();
  registry.dispose();

  assert.deepEqual(calls, ["second", "first"]);
});
