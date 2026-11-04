import { ItemView, TFile, type WorkspaceLeaf } from "obsidian";
import type { BridgeDiagnostic } from "../bridge/bridge-client";
import { RequestGate } from "../lifecycle/request-gate";
import type RiebeckitePlugin from "../main";

export const diagnosticsViewType = "riebeckite-diagnostics";

type DiagnosticsState =
  | { kind: "loading" }
  | {
      kind: "ready";
      diagnostics: readonly BridgeDiagnostic[];
      revision: number;
    }
  | { kind: "no-issues"; revision: number }
  | { kind: "unavailable" }
  | {
      kind: "stale";
      diagnostics: readonly BridgeDiagnostic[];
      revision: number;
    }
  | { kind: "error" };

export class RiebeckiteDiagnosticsView extends ItemView {
  private readonly requests = new RequestGate();
  private path: string | undefined;
  private state: DiagnosticsState = { kind: "loading" };

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RiebeckitePlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return diagnosticsViewType;
  }

  getDisplayText(): string {
    return "Riebeckite Diagnostics";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const request = this.requests.begin();
    const file = this.app.workspace.getActiveFile();
    if (file?.extension !== "md") {
      this.path = undefined;
      this.state = { kind: "unavailable" };
      this.render("Open a Markdown note to inspect it.");
      return;
    }
    this.path = file.path;
    if (this.plugin.bridge.getState().kind !== "connected") {
      this.state = { kind: "unavailable" };
      this.render("Riebeckite is not connected.");
      return;
    }
    if (!this.plugin.editor.supports("diagnostics")) {
      this.state = { kind: "unavailable" };
      this.render("Diagnostics are unavailable on this server.");
      return;
    }
    this.state = { kind: "loading" };
    this.render();
    const result = await this.plugin.editor.diagnostics(file.path);
    if (!this.requests.isCurrent(request) || this.path !== file.path) return;
    if (result.kind !== "resolved") {
      this.state =
        result.kind === "unavailable" || result.kind === "unsupported"
          ? { kind: "unavailable" }
          : { kind: "error" };
    } else if (this.plugin.editor.revision !== result.revision) {
      this.state = {
        kind: "stale",
        diagnostics: result.value,
        revision: result.revision,
      };
    } else {
      this.plugin.setDiagnostics(file.path, result.value);
      this.state = result.value.length
        ? {
            kind: "ready",
            diagnostics: result.value,
            revision: result.revision,
          }
        : { kind: "no-issues", revision: result.revision };
    }
    this.render();
  }

  onClose(): Promise<void> {
    this.requests.cancel();
    this.path = undefined;
    return Promise.resolve();
  }

  private render(message?: string): void {
    const container = this.contentEl;
    container.empty();
    container.createEl("h4", { text: "Document Diagnostics" });
    if (message) container.createEl("p", { text: message });
    if (this.path) container.createEl("p", { text: `Source: ${this.path}` });
    container.createEl("button", { text: "Refresh" }).onclick = () =>
      void this.refresh();
    if (this.state.kind === "loading") {
      container.createEl("p", { text: "Loading diagnostics…" });
      return;
    }
    if (this.state.kind === "unavailable") {
      container.createEl("p", { text: "Diagnostics unavailable." });
      return;
    }
    if (this.state.kind === "error") {
      container.createEl("p", {
        text: "Riebeckite returned invalid diagnostic data.",
      });
      return;
    }
    if (this.state.kind === "no-issues") {
      container.createEl("p", {
        text: `No issues (revision ${this.state.revision}).`,
      });
      return;
    }
    if (this.state.kind === "stale") {
      container.createEl("p", {
        text: `Stale diagnostics (revision ${this.state.revision}). Refresh to update.`,
      });
    }
    const diagnostics = this.state.diagnostics;
    for (const diagnostic of diagnostics)
      this.renderDiagnostic(container, diagnostic);
  }

  private renderDiagnostic(
    container: HTMLElement,
    diagnostic: BridgeDiagnostic,
  ): void {
    const item = container.createEl("button", {
      cls: `riebeckite-diagnostic riebeckite-diagnostic-${diagnostic.severity}`,
      text: `${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`,
    });
    item.setAttribute("aria-label", `Open ${diagnostic.code} diagnostic`);
    item.onclick = () => void this.openDiagnostic(diagnostic);
    if (diagnostic.source) {
      const location = [
        diagnostic.source.path,
        diagnostic.source.line === undefined
          ? undefined
          : `line ${diagnostic.source.line}`,
        diagnostic.source.column === undefined
          ? undefined
          : `column ${diagnostic.source.column}`,
      ]
        .filter((part): part is string => part !== undefined)
        .join(", ");
      container.createEl("p", { text: `${diagnostic.category} · ${location}` });
    }
    if (diagnostic.related.length) {
      container.createEl("p", {
        text: `Related: ${diagnostic.related.map((related) => related.target).join(", ")}`,
      });
    }
    if (diagnostic.fix)
      container.createEl("p", {
        text: `Suggested fix: ${diagnostic.fix.description}`,
      });
  }

  private async openDiagnostic(diagnostic: BridgeDiagnostic): Promise<void> {
    const source = diagnostic.source?.path;
    if (!source) return;
    const path = this.plugin.vaultPath(source) ?? source;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile)
      await this.app.workspace.getLeaf(false).openFile(file, {
        eState:
          diagnostic.source?.line === undefined
            ? undefined
            : {
                line: Math.max(0, diagnostic.source.line - 1),
                column: Math.max(0, (diagnostic.source.column ?? 1) - 1),
              },
      });
  }
}
