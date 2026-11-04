import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import type { BridgeDiagnostic } from "../bridge/bridge-client";

export function diagnosticDecorations(
  diagnostics: () => readonly BridgeDiagnostic[],
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, diagnostics());
      }

      update(update: { docChanged: boolean; view: EditorView }): void {
        if (update.docChanged)
          this.decorations = buildDecorations(update.view, diagnostics());
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
  for (const diagnostic of diagnostics) {
    const line = diagnostic.source?.line;
    if (line === undefined || line < 1 || line > view.state.doc.lines) continue;
    const sourceLine = view.state.doc.line(line);
    const column = Math.max(0, (diagnostic.source?.column ?? 1) - 1);
    const from = Math.min(sourceLine.from + column, sourceLine.to);
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
    marker.textContent = "●";
    return marker;
  }
}
