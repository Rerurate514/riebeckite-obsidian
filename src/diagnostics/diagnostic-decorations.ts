import { RangeSetBuilder, type Text } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import type { BridgeDiagnostic } from "../bridge/bridge-client";

const diagnosticViews = new Set<EditorView>();

export function refreshDiagnosticDecorations(): void {
  for (const view of diagnosticViews) view.dispatch({});
}

export function diagnosticDecorations(
  diagnostics: () => readonly BridgeDiagnostic[],
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private diagnostics: readonly BridgeDiagnostic[];
      private readonly view: EditorView;

      constructor(view: EditorView) {
        this.view = view;
        diagnosticViews.add(view);
        this.diagnostics = diagnostics();
        this.decorations = buildDecorations(view, this.diagnostics);
      }

      destroy(): void {
        diagnosticViews.delete(this.view);
      }

      update(update: { docChanged: boolean; view: EditorView }): void {
        const nextDiagnostics = diagnostics();
        if (
          update.docChanged ||
          !diagnosticsEqual(this.diagnostics, nextDiagnostics)
        ) {
          this.diagnostics = nextDiagnostics;
          this.decorations = buildDecorations(update.view, nextDiagnostics);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );
}

function buildDecorations(
  view: EditorView,
  diagnostics: readonly BridgeDiagnostic[],
): DecorationSet {
  const ranges = new RangeSetBuilder<Decoration>();
  for (const { diagnostic, from } of diagnosticPositions(
    view.state.doc,
    diagnostics,
  )) {
    ranges.add(
      from,
      from,
      Decoration.widget({
        widget: new DiagnosticMarker(diagnostic.severity, diagnostic.message),
        side: 1,
      }),
    );
  }
  return ranges.finish();
}

export function diagnosticPositions(
  doc: Text,
  diagnostics: readonly BridgeDiagnostic[],
): readonly { diagnostic: BridgeDiagnostic; from: number }[] {
  return diagnostics
    .flatMap((diagnostic) => {
      const lineNumber = diagnostic.source?.line;
      if (
        lineNumber === undefined ||
        !Number.isInteger(lineNumber) ||
        lineNumber < 1 ||
        lineNumber > doc.lines
      )
        return [];
      const line = doc.line(lineNumber);
      return [
        {
          diagnostic,
          from:
            line.from + columnToOffset(line.text, diagnostic.source?.column),
        },
      ];
    })
    .sort((left, right) => left.from - right.from);
}

export function columnToOffset(
  text: string,
  column: number | undefined,
): number {
  if (!Number.isFinite(column) || column === undefined || column <= 1) return 0;
  const target = Math.floor(column) - 1;
  let offset = 0;
  let index = 0;
  for (const character of text) {
    if (!/^\p{Mark}$/u.test(character)) {
      if (index === target) return offset;
      index++;
    }
    offset += character.length;
  }
  return text.length;
}

export function diagnosticsEqual(
  left: readonly BridgeDiagnostic[],
  right: readonly BridgeDiagnostic[],
): boolean {
  return (
    left.length === right.length &&
    left.every((diagnostic, index) =>
      diagnosticEquals(diagnostic, right[index]),
    )
  );
}

function diagnosticEquals(
  left: BridgeDiagnostic,
  right: BridgeDiagnostic | undefined,
): boolean {
  return (
    right !== undefined &&
    left.code === right.code &&
    left.severity === right.severity &&
    left.message === right.message &&
    left.category === right.category &&
    left.source?.path === right.source?.path &&
    left.source?.line === right.source?.line &&
    left.source?.column === right.source?.column &&
    left.fix?.kind === right.fix?.kind &&
    left.fix?.description === right.fix?.description &&
    left.related.length === right.related.length &&
    left.related.every(
      (related, index) => related.target === right.related[index]?.target,
    )
  );
}

class DiagnosticMarker extends WidgetType {
  constructor(
    private readonly severity: BridgeDiagnostic["severity"],
    private readonly message: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = `riebeckite-diagnostic-marker riebeckite-diagnostic-${this.severity}`;
    marker.setAttribute("aria-label", this.message);
    marker.title = `${this.severity}: ${this.message}`;
    marker.textContent = "●";
    return marker;
  }
}
