import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { BridgeDiagnostic } from "../src/bridge/bridge-client";
import {
  buildDecorations,
  diagnosticPositions,
} from "../src/diagnostics/diagnostic-decorations";
import {
  filterPublications,
  type PublicationRow,
} from "../src/publication/publication-model";

const heapMiB = () => process.memoryUsage().heapUsed / (1024 * 1024);
const forceGc = () => (globalThis as { gc?: () => void }).gc?.();

// Without a forced GC, V8 may defer reclamation and hide the live-set floor.
function churnHeap(): void {
  const pressure = new Uint8Array(32 * 1024 * 1024);
  pressure.fill(1);
}

test("refreshes 10k diagnostic decorations without growing the heap", async (t) => {
  if (!globalThis.gc) {
    t.skip("heap floor needs --expose-gc; run pnpm test:perf");
    return;
  }
  const doc = EditorState.create({ doc: "a\n".repeat(10_000) }).doc;
  const diagnostics: readonly BridgeDiagnostic[] = Array.from(
    { length: 10_000 },
    (_, index) => diagnostic(index + 1),
  );
  const view = { state: { doc } } as unknown as EditorView;
  const refresh = () => {
    const positions = diagnosticPositions(doc, diagnostics);
    const decorations = buildDecorations(view, diagnostics);
    assert.equal(positions.length, 10_000);
    assert.equal(decorations.size, 10_000);
  };

  for (let index = 0; index < 3; index++) refresh();
  const samples: number[] = [];
  for (let index = 0; index < 12; index++) {
    refresh();
    churnHeap();
    await new Promise((resolve) => setTimeout(resolve, 0));
    forceGc();
    samples.push(heapMiB());
  }

  const half = samples.length / 2;
  const earlyFloor = Math.min(...samples.slice(0, half));
  const lateFloor = Math.min(...samples.slice(half));
  assert.ok(
    lateFloor - earlyFloor < 8,
    `heap floor grew by ${(lateFloor - earlyFloor).toFixed(1)} MiB`,
  );
});

test("builds and filters 1k, 5k, and 10k publication rows near-linearly", () => {
  const perItem: number[] = [];
  for (const count of [1_000, 5_000, 10_000]) {
    const rows = publicationRows(count);
    const repetitions = Math.round(100_000 / count);
    const startedAt = performance.now();
    for (let index = 0; index < repetitions; index++) {
      const filtered = filterPublications(rows, "all", "");
      assert.equal(filtered.length, count);
    }
    const elapsed = performance.now() - startedAt;
    perItem.push(elapsed / repetitions / count);
  }

  assert.ok(
    (perItem[2] as number) < (perItem[0] as number) * 4,
    `per-item time grew from ${perItem[0]} to ${perItem[2]} ms`,
  );
});

function diagnostic(line: number): BridgeDiagnostic {
  return {
    code: "test",
    severity: "warning",
    message: "Test diagnostic",
    category: "test",
    source: { path: "notes/test.md", line, column: 1 },
    related: [],
    fix: undefined,
  };
}

function publicationRows(count: number): readonly PublicationRow[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `notes/note-${index}.md`,
    title: `Note ${index}`,
    state: "resolved" as const,
    publication: {
      source: `notes/note-${index}.md`,
      permalink: `/notes/note-${index}/`,
      locale: null,
      visibility: index % 3 === 0 ? ("draft" as const) : ("public" as const),
      routable: true,
      discoverable: true,
      publishAt: null,
      publicLocation: { permalink: `/notes/note-${index}/` },
      canonicalUrl: null,
      redirects: [],
      reasons: [],
      revision: 1,
    },
  }));
}
