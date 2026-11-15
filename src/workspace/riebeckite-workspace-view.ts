import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { BridgeConnectionState } from "../bridge/bridge-client";
import type { DevServerState } from "../dev/dev-server-controller";
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
    container.addClass("riebeckite-workspace");
    const header = container.createDiv({
      cls: "riebeckite-workspace-header",
    });
    header.createEl("h4", { text: "Riebeckite" });
    const identity = header.createDiv({
      cls: "riebeckite-workspace-identity",
    });
    identity.createEl("span", {
      cls: "riebeckite-workspace-identity-label",
      text: "Site",
    });
    identity.createEl("strong", {
      text: site?.displayName ?? "Not configured",
    });
    identity.createEl("span", {
      cls: "riebeckite-workspace-identity-detail",
      text: `Docs · ${site?.vaultFolder ?? "This vault"}`,
    });
    this.renderServerControls(header, site?.projectDirectory);
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
    const status = container.createDiv({ cls: "riebeckite-dev-status" });
    const logs = this.plugin.devServer.logs();
    const lastLog = logs[logs.length - 1]?.text;
    renderStatusRow(status, serverStatus(state, lastLog));
    renderStatusRow(status, bridgeStatus(state, this.plugin.bridge.getState()));
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
    }
  }

  private renderOverview(container: HTMLElement): void {
    const file = this.plugin.activeMarkdownFile();
    const document = container.createDiv({
      cls: "riebeckite-workspace-document",
    });
    document.createEl("span", {
      cls: "riebeckite-workspace-section-label",
      text: "Current document",
    });
    document.createEl("strong", {
      text: file?.basename ?? "No Markdown note selected",
    });
    document.createEl("small", {
      text:
        file?.path ??
        "Open a Markdown note to access its preview and metadata.",
    });
    const notice = container.createDiv({
      cls: "riebeckite-workspace-notice",
    });
    notice.createEl("strong", { text: "Read-only integration" });
    notice.createEl("span", {
      text: "Start Dev never grants mutation access to your vault.",
    });
    const settings = container.createEl("button", { text: "Open settings" });
    settings.addClass("riebeckite-workspace-settings");
    settings.onclick = () => this.plugin.openSettings();
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
        const notice = container.createDiv({
          cls: "riebeckite-workspace-notice",
        });
        notice.createEl("strong", { text: "Diagnostics unavailable" });
        notice.createEl("span", {
          text: "The connected site could not inspect this document.",
        });
        return;
      }
      const diagnostics = container.createDiv({
        cls: "riebeckite-diagnostics",
      });
      const header = diagnostics.createDiv({
        cls: "riebeckite-diagnostics-header",
      });
      const summary = header.createDiv();
      summary.createEl("span", {
        cls: "riebeckite-workspace-section-label",
        text: "Document diagnostics",
      });
      summary.createEl("strong", {
        text: result.value.length
          ? `${result.value.length} issue${result.value.length === 1 ? "" : "s"}`
          : "No issues",
      });
      summary.createEl("small", { text: file.path });
      header.createEl("button", { text: "Refresh" }).onclick = () =>
        this.render();
      if (!result.value.length) {
        renderStatusRow(diagnostics, {
          label: "Status",
          tone: "ok",
          text: "No issues found",
          detail: "This document passed the available Riebeckite checks.",
        });
        return;
      }
      const list = diagnostics.createDiv({
        cls: "riebeckite-diagnostic-list",
        attr: { role: "list" },
      });
      for (const diagnostic of result.value) {
        const item = list.createDiv({
          cls: `riebeckite-diagnostic-item is-${diagnostic.severity}`,
          attr: { role: "listitem" },
        });
        const heading = item.createDiv({
          cls: "riebeckite-diagnostic-heading",
        });
        heading.createSpan({
          cls: "riebeckite-diagnostic-severity",
          text: diagnostic.severity,
        });
        heading.createEl("code", { text: diagnostic.code });
        item.createEl("strong", { text: diagnostic.message });
        const location = diagnostic.source
          ? [
              diagnostic.source.path,
              diagnostic.source.line === undefined
                ? undefined
                : `line ${diagnostic.source.line}`,
              diagnostic.source.column === undefined
                ? undefined
                : `column ${diagnostic.source.column}`,
            ]
              .filter((part): part is string => part !== undefined)
              .join(" · ")
          : undefined;
        item.createEl("small", {
          text: location
            ? `${diagnostic.category} · ${location}`
            : diagnostic.category,
        });
        if (diagnostic.related.length)
          item.createEl("small", {
            text: `Related: ${diagnostic.related.map((related) => related.target).join(", ")}`,
          });
        if (diagnostic.fix)
          item.createEl("small", {
            text: `Suggested fix: ${diagnostic.fix.description}`,
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
      const details = container.createDiv({
        cls: "riebeckite-publication",
      });
      renderStatusRow(details, publicationStatus(publication.visibility));
      const settings = details.createDiv({
        cls: "riebeckite-publication-settings",
      });
      settings.createEl("span", {
        cls: "riebeckite-workspace-section-label",
        text: "Publishing details",
      });
      const list = settings.createEl("dl", {
        cls: "riebeckite-publication-list",
      });
      renderPublicationDetail(list, "Public location", publication.permalink);
      renderPublicationDetail(
        list,
        "Routing",
        publication.routable ? "Available at this location" : "Not routable",
      );
      renderPublicationDetail(
        list,
        "Discovery",
        publication.discoverable
          ? "Included in discovery"
          : "Excluded from discovery",
      );
      renderPublicationDetail(
        list,
        "Publishing",
        publication.publishAt ?? "Not scheduled",
      );
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

type StatusTone = "ok" | "busy" | "error" | "idle";

type StatusRow = {
  label: string;
  tone: StatusTone;
  text: string;
  detail?: string;
};

function renderStatusRow(container: HTMLElement, row: StatusRow): void {
  const card = container.createDiv({
    cls: `riebeckite-dev-status-row is-${row.tone}`,
  });
  const heading = card.createDiv({ cls: "riebeckite-dev-status-heading" });
  heading.createSpan({ cls: "riebeckite-dev-status-indicator" });
  heading.createSpan({ text: row.label });
  card.createEl("strong", { text: row.text });
  if (row.detail) card.createEl("small", { text: row.detail });
}

function publicationStatus(
  visibility: "public" | "unlisted" | "draft" | "scheduled",
): StatusRow {
  if (visibility === "public")
    return {
      label: "Publication status",
      tone: "ok",
      text: "Public",
      detail: "This document is available to visitors.",
    };
  if (visibility === "scheduled")
    return {
      label: "Publication status",
      tone: "busy",
      text: "Scheduled",
      detail: "This document will become public at its scheduled time.",
    };
  return {
    label: "Publication status",
    tone: "idle",
    text: visibility === "unlisted" ? "Unlisted" : "Draft",
    detail:
      visibility === "unlisted"
        ? "Available by direct link, but excluded from discovery."
        : "Not available to visitors.",
  };
}

function renderPublicationDetail(
  list: HTMLDListElement,
  label: string,
  value: string,
): void {
  const row = list.createDiv({ cls: "riebeckite-publication-detail" });
  row.createEl("dt", { text: label });
  row.createEl("dd", { text: value });
}

function serverStatus(
  state: DevServerState,
  lastLog: string | undefined,
): StatusRow {
  const label = "Development server";
  if (state.kind === "not-configured")
    return {
      label,
      tone: "idle",
      text: "Not configured",
      detail: "Choose a Site Project in settings, then press Start Dev.",
    };
  if (state.kind === "stopped")
    return {
      label,
      tone: "idle",
      text: "Stopped",
      detail: "Press Start Dev to build and serve the site from Obsidian.",
    };
  if (state.kind === "starting")
    return {
      label,
      tone: "busy",
      text: "Starting",
      detail: lastLog
        ? `Waiting for Riebeckite to report ready. Last output: ${lastLog.slice(0, 120)}`
        : "Waiting for Riebeckite to report ready. The first start can take a minute or two.",
    };
  if (state.kind === "running")
    return {
      label,
      tone: "ok",
      text: `Running · ${state.serverUrl}`,
      detail: "This site was started by this plugin and stops when it stops.",
    };
  if (state.kind === "stopping")
    return {
      label,
      tone: "busy",
      text: "Stopping",
      detail: "Waiting for the site process to exit.",
    };
  return {
    label,
    tone: "error",
    text: "Failed",
    detail: `${state.message} Open the Logs tab for the full output, then press Start Dev to retry.`,
  };
}

function bridgeStatus(
  server: DevServerState,
  bridge: BridgeConnectionState,
): StatusRow {
  const label = "Bridge";
  if (bridge.kind === "connected")
    return {
      label,
      tone: "ok",
      text: "Connected",
      detail: `Riebeckite ${bridge.status.server.version}.`,
    };
  if (bridge.kind === "connecting")
    return {
      label,
      tone: "busy",
      text: "Connecting",
      detail: "Verifying the running site identity.",
    };
  if (bridge.kind === "disconnected")
    return {
      label,
      tone: "idle",
      text: "Not connected",
      detail:
        server.kind === "running"
          ? "The site is running but the Bridge is not connected. Check the Logs tab."
          : "Start Dev connects the Bridge automatically.",
    };
  return {
    label,
    tone: "error",
    text:
      bridge.kind === "incompatible"
        ? "Incompatible site"
        : bridge.kind === "unauthorized"
          ? "Token rejected"
          : bridge.kind === "unavailable"
            ? "Unavailable"
            : "Error",
    detail: bridge.message,
  };
}
