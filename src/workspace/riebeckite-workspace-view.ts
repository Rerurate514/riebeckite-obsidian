import { ItemView, type WorkspaceLeaf } from "obsidian";
import type RiebeckitePlugin from "../main";
import { activeSite } from "../settings/settings";

export const workspaceViewType = "riebeckite-workspace";

type Tab =
  | "overview"
  | "preview"
  | "publication"
  | "diagnostics"
  | "impact"
  | "seo"
  | "logs";

export class RiebeckiteWorkspaceView extends ItemView {
  private tab: Tab = "overview";
  private removeListener: (() => void) | undefined;
  private featureRequest = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RiebeckitePlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return workspaceViewType;
  }

  getDisplayText(): string {
    return "Riebeckite";
  }

  async onOpen(): Promise<void> {
    this.removeListener = this.plugin.devServer.onChange(() => this.render());
    this.render();
  }

  onClose(): Promise<void> {
    this.removeListener?.();
    this.removeListener = undefined;
    return Promise.resolve();
  }

  selectTab(tab: Tab): void {
    this.tab = tab;
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    const site = activeSite(this.plugin.settings);
    container.createEl("h4", { text: "Riebeckite" });
    const identity = container.createDiv({
      cls: "riebeckite-workspace-identity",
    });
    identity.createEl("div", {
      text: `Site: ${site?.displayName ?? "Not configured"}`,
    });
    identity.createEl("small", {
      text: `Docs: ${site?.vaultFolder ?? "This vault"}`,
    });
    this.renderServerControls(container, site?.projectDirectory);
    const navigation = container.createDiv({
      cls: "riebeckite-workspace-tabs",
      attr: { role: "tablist", "aria-label": "Riebeckite" },
    });
    for (const tab of tabs) {
      const button = navigation.createEl("button", {
        text: tab.label,
        attr: { role: "tab", "aria-selected": String(this.tab === tab.id) },
      });
      button.onclick = () => this.selectTab(tab.id);
    }
    const panel = container.createDiv({
      cls: "riebeckite-workspace-panel",
      attr: { role: "tabpanel" },
    });
    if (this.tab === "overview") this.renderOverview(panel);
    else if (this.tab === "preview") this.renderPreview(panel);
    else if (this.tab === "logs") this.renderLogs(panel);
    else void this.renderFeature(panel);
  }

  private renderServerControls(
    container: HTMLElement,
    directory: string | undefined,
  ): void {
    const state = this.plugin.devServer.getState();
    const status = container.createEl("p", { text: serverStatus(state) });
    status.addClass("riebeckite-dev-status");
    const actions = container.createDiv({ cls: "riebeckite-dev-actions" });
    if (
      state.kind === "running" ||
      state.kind === "starting" ||
      state.kind === "stopping"
    ) {
      const stop = actions.createEl("button", { text: "Stop Dev" });
      stop.disabled = state.kind === "stopping";
      stop.onclick = () => void this.plugin.stopDev();
      if (state.kind === "running")
        actions.createEl("button", { text: "Restart Dev" }).onclick = () =>
          void this.plugin.restartDev();
    } else {
      const start = actions.createEl("button", {
        text: "Start Dev",
        cls: "mod-cta",
      });
      start.disabled = !directory;
      start.onclick = () => void this.plugin.startDev();
      if (!directory)
        container.createEl("p", {
          text: "Choose a Site Project before starting.",
        });
    }
  }

  private renderOverview(container: HTMLElement): void {
    const state = this.plugin.bridge.getState();
    const file = this.plugin.activeMarkdownFile();
    container.createEl("p", {
      text: `Bridge: ${state.kind === "connected" ? "Connected" : state.kind}`,
    });
    container.createEl("p", {
      text: `Current note: ${file?.path ?? "No Markdown note selected"}`,
    });
    container.createEl("p", {
      text: "Mutation access is never granted by Start Dev.",
    });
    container.createEl("button", { text: "Open settings" }).onclick = () =>
      this.plugin.openSettings();
  }

  private renderPreview(container: HTMLElement): void {
    const file = this.plugin.activeMarkdownFile();
    if (!file) {
      container.createEl("p", { text: "Open a Markdown note to preview it." });
      return;
    }
    if (this.plugin.bridge.getState().kind !== "connected") {
      container.createEl("p", { text: "Riebeckite is not connected." });
      return;
    }
    const source = this.plugin.bridgeSource(file.path);
    if (!source) {
      container.createEl("p", {
        text: "This note is outside the profile's mapped vault folder.",
      });
      return;
    }
    container.createEl("button", { text: "Reload" }).onclick = () =>
      void this.plugin.refreshWorkspace();
    void this.renderResolvedPreview(container, source);
  }

  private async renderResolvedPreview(
    container: HTMLElement,
    source: string,
  ): Promise<void> {
    const result = await this.plugin.bridge.resolvePage(
      this.plugin.serverUrl(),
      this.plugin.bridgeToken(),
      source,
    );
    if (!container.isConnected) return;
    if (result.kind !== "resolved") {
      container.createEl("p", {
        text:
          result.kind === "not-found"
            ? "This note is not a Riebeckite content page."
            : "Live preview is unavailable.",
      });
      return;
    }
    container.createEl("p", {
      text: `${result.page.visibility} · ${result.page.routable ? "routable" : "not routable"}`,
    });
    if (!result.page.routable) return;
    container.createEl("button", { text: "Open in browser" }).onclick = () =>
      window.open(result.previewUrl, "_blank", "noopener");
    const frame = container.createEl("iframe", {
      cls: "riebeckite-preview-frame",
    });
    frame.setAttribute("sandbox", "allow-forms allow-popups allow-scripts");
    frame.setAttribute("title", "Riebeckite live preview");
    frame.src = result.previewUrl;
  }

  private async renderFeature(container: HTMLElement): Promise<void> {
    const file = this.plugin.activeMarkdownFile();
    if (!file) {
      container.createEl("p", { text: "Open a Markdown note first." });
      return;
    }
    if (this.plugin.bridge.getState().kind !== "connected") {
      container.createEl("p", { text: "Riebeckite is not connected." });
      return;
    }
    const request = ++this.featureRequest;
    container.createEl("p", { text: "Loading…" });
    if (this.tab === "diagnostics") {
      const result = await this.plugin.editor.diagnostics(file.path);
      if (!this.isCurrentFeatureRequest(request, container)) return;
      container.empty();
      if (result.kind !== "resolved") {
        container.createEl("p", { text: "Diagnostics are unavailable." });
        return;
      }
      container.createEl("button", { text: "Refresh" }).onclick = () =>
        this.render();
      if (!result.value.length) {
        container.createEl("p", { text: "No issues." });
        return;
      }
      for (const diagnostic of result.value) {
        container.createEl("p", {
          text: `${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`,
        });
      }
      return;
    }
    if (this.tab === "impact") {
      const impact = await this.plugin.editor.impact(file.path);
      if (!this.isCurrentFeatureRequest(request, container)) return;
      container.empty();
      if (impact.kind !== "resolved") {
        container.createEl("p", { text: "Build impact is unavailable." });
        return;
      }
      for (const [label, outputs] of [
        ["Changed", impact.value.affectedOutputs],
        ["Unchanged", impact.value.unchangedOutputs],
        ["Removed", impact.value.removedOutputs],
      ] as const) {
        container.createEl("p", { text: `${label}: ${outputs.length}` });
        for (const output of outputs)
          container.createEl("p", {
            text: `${output.path} · ${output.producer}`,
          });
      }
      return;
    }
    const result = await this.plugin.editor.publication(file.path);
    if (!this.isCurrentFeatureRequest(request, container)) return;
    container.empty();
    if (result.kind !== "resolved") {
      container.createEl("p", { text: "Publication data is unavailable." });
      return;
    }
    const publication = result.value;
    if (this.tab === "publication") {
      for (const [label, value] of [
        ["Visibility", publication.visibility],
        ["Public location", publication.permalink],
        ["Routable", String(publication.routable)],
        ["Discoverable", String(publication.discoverable)],
        ["Publish at", publication.publishAt ?? "not scheduled"],
      ])
        container.createEl("p", { text: `${label}: ${value}` });
      return;
    }
    if (this.tab === "seo") {
      const seo = publication.seo;
      if (!seo) {
        container.createEl("p", { text: "SEO information is unavailable." });
        return;
      }
      for (const [label, value] of [
        ["Title", seo.title],
        ["Description", seo.description ?? "not supplied"],
        ["Canonical URL", seo.canonicalUrl ?? "not supplied"],
        ["Indexable", seo.indexable ? "yes" : "no"],
        ["Issues", seo.issues.length ? seo.issues.join("; ") : "no issues"],
      ])
        container.createEl("p", { text: `${label}: ${value}` });
      return;
    }
  }

  private isCurrentFeatureRequest(
    request: number,
    container: HTMLElement,
  ): boolean {
    return request === this.featureRequest && container.isConnected;
  }

  private renderLogs(container: HTMLElement): void {
    const logs = this.plugin.devServer.logs();
    if (!logs.length)
      container.createEl("p", { text: "No managed development server logs." });
    for (const entry of logs)
      container.createEl("pre", { text: `[${entry.stream}] ${entry.text}` });
  }
}

const tabs: readonly { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "preview", label: "Preview" },
  { id: "publication", label: "Publication" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "impact", label: "Impact" },
  { id: "seo", label: "SEO" },
  { id: "logs", label: "Logs" },
];

function serverStatus(
  state: ReturnType<RiebeckitePlugin["devServer"]["getState"]>,
): string {
  if (state.kind === "running") return `● Running · ${state.serverUrl}`;
  if (state.kind === "failed") return `● ${state.message}`;
  if (state.kind === "not-configured")
    return "● Site project is not configured";
  return `● Development server ${state.kind}`;
}
