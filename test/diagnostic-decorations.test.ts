import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import type { BridgeDiagnostic } from "../src/bridge/bridge-client";
import {
  columnToOffset,
  diagnosticPositions,
  diagnosticsEqual,
} from "../src/diagnostics/diagnostic-decorations";

test("converts diagnostic columns by grapheme and clamps them to the line", () => {
  assert.equal(columnToOffset("日本語", 3), 2);
  assert.equal(columnToOffset("a😀b", 3), 3);
  assert.equal(columnToOffset("e\u0301x", 2), 2);
  assert.equal(columnToOffset("text", 99), 4);
  assert.equal(columnToOffset("text", 0), 0);
  assert.equal(columnToOffset("text", Number.NaN), 0);
});

test("uses normalized CodeMirror lines for CRLF diagnostic positions", () => {
  const doc = EditorState.create({ doc: "first\r\n😀e\u0301x" }).doc;
  assert.equal(doc.line(1).text.includes("\r"), false);
  assert.deepEqual(
    diagnosticPositions(doc, [diagnostic({ line: 2, column: 3 })]).map(
      ({ from }) => from,
    ),
    [doc.line(2).from + 4],
  );
});

test("compares diagnostics by content rather than array identity", () => {
  const original = diagnostic({ line: 1, column: 2 });
  assert.equal(diagnosticsEqual([original], [{ ...original }]), true);
  assert.equal(
    diagnosticsEqual([original], [{ ...original, message: "changed" }]),
    false,
  );
});

test("does not retain positions across 100 diagnostic refreshes", () => {
  const doc = EditorState.create({ doc: "line" }).doc;
  for (let index = 0; index < 100; index++) {
    const positions = diagnosticPositions(doc, [
      diagnostic({ line: 1, column: 1 }),
    ]);
    assert.equal(positions.length, 1);
  }
});

test("builds 1k, 5k, and 10k diagnostic positions within one second", () => {
  const doc = EditorState.create({ doc: "a\n".repeat(10_000) }).doc;
  for (const count of [1_000, 5_000, 10_000]) {
    const diagnostics = Array.from({ length: count }, (_, index) =>
      diagnostic({ line: count - index, column: 1 }),
    );
    const startedAt = performance.now();
    const positions = diagnosticPositions(doc, diagnostics);
    assert.equal(positions.length, count);
    assert.ok(performance.now() - startedAt < 1_000);
  }
});

function diagnostic(
  source: Omit<NonNullable<BridgeDiagnostic["source"]>, "path">,
): BridgeDiagnostic {
  return {
    code: "test",
    severity: "warning",
    message: "Test diagnostic",
    category: "test",
    source: { ...source, path: "notes/test.md" },
    related: [],
    fix: undefined,
  };
}
