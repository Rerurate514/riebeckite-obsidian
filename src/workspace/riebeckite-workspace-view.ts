import { ItemView, type WorkspaceLeaf } from "obsidian";
import type {
  BridgeConnectionState,
  BridgeImpact,
  BridgeImpactOutput,
  BridgePublication,
} from "../bridge/bridge-client";
import type { DevServerState } from "../dev/dev-server-controller";
import type RiebeckitePlugin from "../main";
import {
  impactReasonLabel,
  seoIssueLabel,
} from "../publication/publication-model";
import { activeSite } from "../settings/settings";

export const workspaceViewType = "riebeckite-workspace";

type Tab =
  | "overview"
  | "preview"
  | "publication"
  | "diagnostics"
  | "review"
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
    const actions = container.createDiv({ cls: "riebeckite-dev-actions" });
    actions.createEl("button", { text: "Reload" }).onclick = () =>
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
    const actions = container.createDiv({ cls: "riebeckite-dev-actions" });
    actions.createEl("button", { text: "Open in browser" }).onclick = () =>
      window.open(result.previewUrl, "_blank", "noopener");
    actions.createEl("button", { text: "Copy preview URL" }).onclick = () =>
      void navigator.clipboard.writeText(result.previewUrl);
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
      this.plugin.setDiagnostics(file.path, result.value);
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
        if (diagnostic.source) {
          const open = item.createEl("button", { text: "Open diagnostic" });
          open.onclick = () => void this.plugin.openDiagnostic(diagnostic);
        }
      }
      return;
    }
    if (this.tab === "impact") {
      const impact = await this.plugin.editor.impact(file.path);
      if (!this.isCurrentFeatureRequest(request, container)) return;
      container.empty();
      if (impact.kind !== "resolved") {
        const notice = container.createDiv({
          cls: "riebeckite-workspace-notice",
        });
        notice.createEl("strong", { text: "Build impact unavailable" });
        notice.createEl("span", {
          text: "The connected site could not inspect this document's build impact.",
        });
        return;
      }
      this.renderImpact(container, impact.value);
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
    if (this.tab === "review") {
      const [diagnostics, impact] = await Promise.all([
        this.plugin.editor.diagnostics(file.path),
        this.plugin.editor.impact(file.path),
      ]);
      if (!this.isCurrentFeatureRequest(request, container)) return;
      this.renderReview(container, publication, diagnostics, impact);
      return;
    }
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
      this.renderSeo(container, publication, file.path);
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
    const section = container.createDiv({ cls: "riebeckite-logs" });
    const header = section.createDiv({ cls: "riebeckite-feature-header" });
    const summary = header.createDiv();
    summary.createEl("span", {
      cls: "riebeckite-workspace-section-label",
      text: "Managed development server",
    });
    summary.createEl("strong", {
      text: logs.length
        ? `${logs.length} log entr${logs.length === 1 ? "y" : "ies"}`
        : "No log entries",
    });
    summary.createEl("small", {
      text: logs.length
        ? "Latest output from the server started by Riebeckite."
        : "Start Dev to capture server output here.",
    });
    header.createEl("button", { text: "Refresh" }).onclick = () =>
      this.render();
    if (!logs.length) return;
    const list = section.createDiv({
      cls: "riebeckite-log-list",
      attr: { role: "log", "aria-live": "polite" },
    });
    for (const entry of logs) {
      const item = list.createDiv({
        cls: `riebeckite-log-item is-${entry.stream}`,
      });
      item.createEl("span", {
        cls: "riebeckite-log-stream",
        text: entry.stream,
      });
      item.createEl("code", { text: entry.text });
    }
  }

  private renderReview(
    container: HTMLElement,
    publication: BridgePublication,
    diagnostics: Awaited<ReturnType<RiebeckitePlugin["editor"]["diagnostics"]>>,
    impact: Awaited<ReturnType<RiebeckitePlugin["editor"]["impact"]>>,
  ): void {
    const section = container.createDiv({ cls: "riebeckite-review" });
    section.createEl("h5", { text: "Publish review" });
    renderStatusRow(section, publicationStatus(publication.visibility));
    renderStatusRow(section, {
      label: "SEO",
      tone: publication.seo?.issues.length ? "busy" : "ok",
      text: publication.seo?.issues.length
        ? `${publication.seo.issues.length} issue${publication.seo.issues.length === 1 ? "" : "s"}`
        : "No SEO issues",
      detail: publication.seo?.indexable
        ? "This page is indexable."
        : "Search indexing is unavailable or disabled.",
    });
    renderStatusRow(section, {
      label: "Diagnostics",
      tone:
        diagnostics.kind === "resolved" && diagnostics.value.length === 0
          ? "ok"
          : diagnostics.kind === "resolved"
            ? "busy"
            : "idle",
      text:
        diagnostics.kind === "resolved"
          ? diagnostics.value.length
            ? `${diagnostics.value.length} issue${diagnostics.value.length === 1 ? "" : "s"}`
            : "No issues"
          : "Unavailable",
    });
    renderStatusRow(section, {
      label: "Build impact",
      tone:
        impact.kind === "resolved" && !impact.value.fullRegenerationRequired
          ? "ok"
          : impact.kind === "resolved"
            ? "busy"
            : "idle",
      text:
        impact.kind === "resolved"
          ? impact.value.fullRegenerationRequired
            ? "Full regeneration required"
            : `${impact.value.affectedOutputs.length} changed outputs`
          : "Unavailable",
    });
    const actions = section.createDiv({ cls: "riebeckite-dev-actions" });
    for (const [tab, label] of [
      ["publication", "Publication"],
      ["seo", "SEO"],
      ["diagnostics", "Diagnostics"],
      ["impact", "Impact"],
    ] as const)
      actions.createEl("button", { text: label }).onclick = () =>
        this.selectTab(tab);
  }

  private renderImpact(container: HTMLElement, impact: BridgeImpact): void {
    const section = container.createDiv({ cls: "riebeckite-impact" });
    const header = section.createDiv({ cls: "riebeckite-feature-header" });
    const summary = header.createDiv();
    summary.createEl("span", {
      cls: "riebeckite-workspace-section-label",
      text: "Build impact",
    });
    const total =
      impact.affectedOutputs.length +
      impact.unchangedOutputs.length +
      impact.removedOutputs.length;
    summary.createEl("strong", {
      text: total
        ? `${total} output${total === 1 ? "" : "s"} inspected`
        : "No outputs affected",
    });
    summary.createEl("small", {
      text:
        impact.completeness === "complete"
          ? "The connected site returned a complete impact analysis."
          : "The connected site could not determine the complete impact.",
    });
    header.createEl("button", { text: "Refresh" }).onclick = () =>
      this.render();
    const overview = section.createDiv({ cls: "riebeckite-impact-overview" });
    renderImpactMetric(
      overview,
      "Changed",
      impact.affectedOutputs.length,
      "changed",
    );
    renderImpactMetric(
      overview,
      "Unchanged",
      impact.unchangedOutputs.length,
      "unchanged",
    );
    renderImpactMetric(
      overview,
      "Removed",
      impact.removedOutputs.length,
      "removed",
    );
    if (impact.fullRegenerationRequired) {
      const notice = section.createDiv({ cls: "riebeckite-workspace-notice" });
      notice.createEl("strong", { text: "Full regeneration required" });
      notice.createEl("span", {
        text: "This change requires the entire site to be regenerated.",
      });
    }
    for (const [label, outputs, tone] of [
      ["Changed", impact.affectedOutputs, "changed"],
      ["Unchanged", impact.unchangedOutputs, "unchanged"],
      ["Removed", impact.removedOutputs, "removed"],
    ] as const) {
      if (!outputs.length) continue;
      const group = section.createDiv({ cls: "riebeckite-impact-group" });
      group.createEl("h5", { text: `${label} · ${outputs.length}` });
      const list = group.createDiv({
        cls: "riebeckite-impact-list",
        attr: { role: "list" },
      });
      for (const output of outputs) renderImpactOutput(list, output, tone);
    }
  }

  private renderSeo(
    container: HTMLElement,
    publication: BridgePublication,
    path: string,
  ): void {
    const section = container.createDiv({ cls: "riebeckite-seo" });
    const header = section.createDiv({ cls: "riebeckite-feature-header" });
    const summary = header.createDiv();
    summary.createEl("span", {
      cls: "riebeckite-workspace-section-label",
      text: "Search visibility",
    });
    const seo = publication.seo;
    summary.createEl("strong", {
      text: !seo
        ? "SEO information unavailable"
        : seo.issues.length
          ? `${seo.issues.length} issue${seo.issues.length === 1 ? "" : "s"} found`
          : "No SEO issues found",
    });
    summary.createEl("small", { text: path });
    header.createEl("button", { text: "Refresh" }).onclick = () =>
      this.render();
    if (!seo) {
      const notice = section.createDiv({ cls: "riebeckite-workspace-notice" });
      notice.createEl("strong", { text: "No SEO data" });
      notice.createEl("span", {
        text: "The connected site did not return SEO information for this document.",
      });
      return;
    }
    renderStatusRow(section, {
      label: "Indexing",
      tone: seo.indexable ? "ok" : "idle",
      text: seo.indexable ? "Indexable" : "Not indexable",
      detail: seo.indexable
        ? "Search engines can include this page in their results."
        : "Search engines should not include this page in their results.",
    });
    const details = section.createEl("dl", {
      cls: "riebeckite-publication-list",
    });
    renderPublicationDetail(details, "Title", seo.title);
    renderPublicationDetail(
      details,
      "Description",
      seo.description ?? "Not supplied",
    );
    renderPublicationDetail(
      details,
      "Canonical URL",
      seo.canonicalUrl ?? "Not supplied",
    );
    if (!seo.issues.length) return;
    const issues = section.createDiv({ cls: "riebeckite-seo-issues" });
    issues.createEl("h5", { text: "Issues" });
    const list = issues.createDiv({
      cls: "riebeckite-diagnostic-list",
      attr: { role: "list" },
    });
    for (const issue of seo.issues) {
      const item = list.createDiv({
        cls: "riebeckite-diagnostic-item is-warning",
        attr: { role: "listitem" },
      });
      item.createEl("strong", { text: seoIssueLabel(issue) });
      item.createEl("small", { text: issue });
    }
  }
}

const tabs: readonly { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "preview", label: "Preview" },
  { id: "publication", label: "Publication" },
  { id: "review", label: "Review" },
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

function renderImpactMetric(
  container: HTMLElement,
  label: string,
  value: number,
  tone: "changed" | "unchanged" | "removed",
): void {
  const card = container.createDiv({
    cls: `riebeckite-impact-metric is-${tone}`,
  });
  card.createEl("span", { text: label });
  card.createEl("strong", { text: String(value) });
}

function renderImpactOutput(
  container: HTMLElement,
  output: BridgeImpactOutput,
  tone: "changed" | "unchanged" | "removed",
): void {
  const item = container.createDiv({
    cls: `riebeckite-impact-item is-${tone}`,
    attr: { role: "listitem" },
  });
  item.createEl("code", { text: output.path });
  const detail = item.createDiv({ cls: "riebeckite-impact-detail" });
  detail.createEl("span", { text: output.producer });
  const reason = `${impactReasonLabel(output.reason.type)}${output.reason.slug ? `: ${output.reason.slug}` : ""}`;
  detail.createEl("span", { text: reason });
  const dependencies = output.dependencies
    .map((dependency) => dependency.slug ?? dependency.type)
    .filter(Boolean);
  if (dependencies.length)
    item.createEl("small", {
      text: `Dependencies: ${dependencies.join(", ")}`,
    });
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
