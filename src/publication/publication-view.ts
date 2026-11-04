import { ItemView, TFile, type WorkspaceLeaf } from "obsidian";
import type { BridgeImpact, BridgeMutationPlan } from "../bridge/bridge-client";
import type RiebeckitePlugin from "../main";
import {
  filterPublications,
  type PublicationFilter,
  type PublicationRow,
} from "./publication-model";

export const publicationViewType = "riebeckite-publication";

export class RiebeckitePublicationView extends ItemView {
  private readonly rows = new Map<string, PublicationRow>();
  private readonly diagnosticSummaries = new Map<string, string>();
  private readonly impacts = new Map<string, BridgeImpact>();
  private filter: PublicationFilter = "all";
  private query = "";
  private selectedPath: string | undefined;
  private request = 0;
  private diagnosticRequest = 0;
  private visibleRows = 100;
  private mutationPlan: { path: string; plan: BridgeMutationPlan } | undefined;
  private mutationMessage: string | undefined;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RiebeckitePlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return publicationViewType;
  }

  getDisplayText(): string {
    return "Riebeckite Publication";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (file?.extension === "md") await this.refreshFile(file);
    this.render();
  }

  private async refreshFile(file: TFile): Promise<void> {
    const request = ++this.request;
    const result = await this.plugin.editor.publication(file.path);
    if (request !== this.request) return;
    this.rows.set(file.path, toRow(file, result));
    this.selectedPath ??= file.path;
  }

  private async refreshVault(): Promise<void> {
    if (!this.plugin.editor.supports("publication")) {
      this.render();
      return;
    }
    const request = ++this.request;
    const files = this.app.vault.getMarkdownFiles();
    this.visibleRows = 100;
    for (const file of files) {
      this.rows.set(file.path, {
        path: file.path,
        title: file.basename,
        publication: undefined,
        state: "unresolved",
      });
    }
    this.render("Refreshing publication data…");
    let index = 0;
    const worker = async (): Promise<void> => {
      while (index < files.length) {
        const file = files[index++];
        if (!file) return;
        const result = await this.plugin.editor.publication(file.path);
        if (request !== this.request) return;
        this.rows.set(file.path, toRow(file, result));
        if (index % 25 === 0)
          this.render(`Refreshing publication data… ${index}/${files.length}`);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, files.length) }, worker),
    );
    if (request === this.request) this.render();
  }

  private render(message?: string): void {
    const container = this.contentEl;
    container.empty();
    container.createEl("h4", { text: "Publication Manager" });
    if (this.plugin.bridge.getState().kind !== "connected") {
      container.createEl("p", { text: "Riebeckite is not connected." });
      return;
    }
    if (!this.plugin.editor.supports("publication")) {
      container.createEl("p", {
        text: "Publication inspection is unavailable on this server.",
      });
      return;
    }
    const controls = container.createDiv({
      cls: "riebeckite-publication-controls",
    });
    const select = controls.createEl("select", {
      attr: { "aria-label": "Publication filter" },
    });
    for (const filter of filters) {
      const option = select.createEl("option", {
        text: filter.label,
        value: filter.value,
      });
      option.selected = filter.value === this.filter;
    }
    select.onchange = () => {
      this.filter = select.value as PublicationFilter;
      this.render();
    };
    const search = controls.createEl("input", {
      type: "search",
      placeholder: "Search notes",
      attr: { "aria-label": "Search publication data" },
    });
    search.value = this.query;
    search.oninput = () => {
      this.query = search.value;
      this.render();
    };
    controls.createEl("button", { text: "Refresh vault" }).onclick = () =>
      void this.refreshVault();
    if (message) container.createEl("p", { text: message });
    const rows = filterPublications(
      [...this.rows.values()],
      this.filter,
      this.query,
    );
    if (!rows.length) {
      container.createEl("p", { text: "No publication data to display." });
      return;
    }
    const list = container.createEl("div", {
      cls: "riebeckite-publication-list",
    });
    for (const row of rows.slice(0, this.visibleRows)) {
      const button = list.createEl("button", {
        text: `${row.title} · ${row.publication?.visibility ?? row.state}`,
        cls: "riebeckite-publication-row",
      });
      button.setAttribute(
        "aria-pressed",
        String(row.path === this.selectedPath),
      );
      button.onclick = () => {
        this.selectedPath = row.path;
        this.render();
        void this.loadDiagnosticSummary(row.path);
        void this.loadImpact(row.path);
      };
    }
    if (rows.length > this.visibleRows) {
      list.createEl("button", {
        text: `Show ${Math.min(100, rows.length - this.visibleRows)} more (${rows.length - this.visibleRows} remaining)`,
      }).onclick = () => {
        this.visibleRows += 100;
        this.render();
      };
    }
    const selected = this.selectedPath
      ? this.rows.get(this.selectedPath)
      : undefined;
    if (selected) this.renderDetails(container, selected);
  }

  private renderDetails(container: HTMLElement, row: PublicationRow): void {
    const details = container.createDiv({
      cls: "riebeckite-publication-details",
    });
    details.createEl("h5", { text: row.title });
    details.createEl("p", { text: `Source: ${row.path}` });
    if (!row.publication) {
      details.createEl("p", { text: `Status: ${row.state}` });
      return;
    }
    const publication = row.publication;
    for (const [label, value] of [
      ["Public location", publication.permalink],
      ["Visibility", publication.visibility],
      ["Routable", String(publication.routable)],
      ["Discoverable", String(publication.discoverable)],
      ["Locale", publication.locale ?? "default"],
      ["Publish at", publication.publishAt ?? "not scheduled"],
      ["Canonical URL", publication.canonicalUrl ?? "not supplied"],
      ["Revision", String(publication.revision)],
      ["Reasons", publication.reasons.join("; ")],
      [
        "Diagnostics",
        this.diagnosticSummaries.get(
          this.plugin.bridgeSource(row.path) ?? "",
        ) ?? "not loaded",
      ],
      ["SEO", seoStatus(publication)],
    ]) {
      details.createEl("p", { text: `${label}: ${value}` });
    }
    const impact = this.impacts.get(row.path);
    if (impact) {
      details.createEl("p", {
        text: `Last build impact: ${impact.affectedOutputs.length} changed, ${impact.unchangedOutputs.length} unchanged, ${impact.removedOutputs.length} removed (${impact.completeness}).`,
      });
    }
    if (publication.redirects.length) {
      details.createEl("p", {
        text: `Redirects: ${publication.redirects.map((redirect) => `${redirect.from} → ${redirect.to} (${redirect.status})`).join(", ")}`,
      });
    }
    const actions = details.createDiv();
    actions.createEl("button", { text: "Open note" }).onclick = () =>
      void this.openNote(row.path);
    actions.createEl("button", { text: "Open Live Preview" }).onclick = () =>
      void this.plugin.openPreview();
    actions.createEl("button", { text: "Refresh" }).onclick = () =>
      void this.refreshFileByPath(row.path);
    if (publication.canonicalUrl) {
      actions.createEl("button", { text: "Copy public URL" }).onclick = () =>
        void navigator.clipboard.writeText(publication.canonicalUrl as string);
    }
    if (publication.routable) {
      actions.createEl("button", { text: "Open development preview" }).onclick =
        () => void this.openDevelopmentPreview(row.path);
    }
    this.renderMutation(
      details,
      row.path,
      publication.visibility,
      publication.publishAt,
    );
  }

  private renderMutation(
    container: HTMLElement,
    path: string,
    visibility: string,
    publishAt: string | null,
  ): void {
    const section = container.createDiv({
      cls: "riebeckite-publication-mutation",
    });
    section.createEl("h6", { text: "Reviewed frontmatter edit" });
    const visibilityInput = section.createEl("select", {
      attr: { "aria-label": "Visibility" },
    });
    for (const value of ["public", "unlisted", "draft", "scheduled"]) {
      const option = visibilityInput.createEl("option", { text: value, value });
      option.selected = value === visibility;
    }
    const publishAtInput = section.createEl("input", {
      type: "text",
      value: publishAt ?? "",
      placeholder: "Publish at (ISO 8601)",
      attr: { "aria-label": "Publish at" },
    });
    section.createEl("button", { text: "Create review plan" }).onclick = () =>
      void this.planMutation(path, visibilityInput.value, publishAtInput.value);
    const current = this.mutationPlan;
    if (current?.path === path) {
      section.createEl("p", {
        text: `Plan ${current.plan.id}: ${current.plan.changes.length} change(s), ${current.plan.warnings.length} warning(s).`,
      });
      if (current.plan.warnings.length)
        section.createEl("pre", {
          text: JSON.stringify(current.plan.warnings, null, 2),
        });
      if (current.plan.changes.length)
        section.createEl("pre", {
          text: JSON.stringify(current.plan.changes, null, 2),
        });
      section.createEl("button", { text: "Apply approved plan" }).onclick =
        () => void this.applyMutation(current.plan.id);
    }
    if (this.mutationMessage)
      section.createEl("p", { text: this.mutationMessage });
  }

  private async planMutation(
    path: string,
    visibility: string,
    publishAt: string,
  ): Promise<void> {
    const result = await this.plugin.editor.planFrontmatter(
      path,
      {
        visibility,
        ...(publishAt.trim() ? { publishAt: publishAt.trim() } : {}),
      },
      publishAt.trim() ? [] : ["publishAt"],
    );
    if (result.kind === "resolved") {
      this.mutationPlan = { path, plan: result.value };
      this.mutationMessage =
        "Review the plan, then approve it outside Obsidian before applying.";
    } else {
      this.mutationMessage = mutationMessage(result.kind);
    }
    this.render();
  }

  private async applyMutation(planId: string): Promise<void> {
    const result = await this.plugin.editor.applyMutation(planId);
    if (result.kind === "resolved" && result.value.applied) {
      this.mutationPlan = undefined;
      this.mutationMessage = "Approved plan applied.";
      await this.refreshFileByPath(this.selectedPath ?? "");
    } else if (result.kind === "resolved") {
      this.mutationMessage = result.value.conflicts.some(
        (conflict) => conflict.code === "approval-required",
      )
        ? "Server-side approval is required before this plan can be applied."
        : "The server rejected this plan.";
    } else {
      this.mutationMessage = mutationMessage(result.kind);
    }
    this.render();
  }

  private async refreshFileByPath(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.refreshFile(file);
    this.render();
  }

  private async loadDiagnosticSummary(path: string): Promise<void> {
    if (!this.plugin.editor.supports("diagnostics")) {
      this.diagnosticSummaries.set(path, "server does not support diagnostics");
      this.render();
      return;
    }
    const request = ++this.diagnosticRequest;
    const result = await this.plugin.editor.diagnostics(path);
    if (request !== this.diagnosticRequest || path !== this.selectedPath)
      return;
    this.diagnosticSummaries.set(
      this.plugin.bridgeSource(path) ?? "",
      result.kind === "resolved"
        ? result.value.length
          ? `${result.value.length} issue(s)`
          : "no issues"
        : result.kind === "unavailable"
          ? "unavailable"
          : "not available",
    );
    this.render();
  }

  private async loadImpact(path: string): Promise<void> {
    if (!this.plugin.editor.supports("build-impact")) return;
    const result = await this.plugin.editor.impact(path);
    if (path !== this.selectedPath || result.kind !== "resolved") return;
    this.impacts.set(path, result.value);
    this.render();
  }

  private async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile)
      await this.app.workspace.getLeaf(false).openFile(file);
  }

  private async openDevelopmentPreview(path: string): Promise<void> {
    const result = await this.plugin.bridge.resolvePage(
      this.plugin.serverUrl(),
      this.plugin.bridgeToken(),
      this.plugin.bridgeSource(path) ?? path,
    );
    if (result.kind === "resolved" && result.page.routable)
      window.open(result.previewUrl, "_blank", "noopener");
  }
}

function seoStatus(
  publication: NonNullable<PublicationRow["publication"]>,
): string {
  if (!publication.discoverable) return "not indexed";
  return publication.canonicalUrl
    ? "indexable; canonical URL available"
    : "indexable";
}

function mutationMessage(kind: string): string {
  return kind === "unauthorized"
    ? "The Bridge mutation token was rejected."
    : kind === "unavailable"
      ? "Frontmatter mutations are unavailable. Configure a mutation token and connect to the Bridge."
      : "The Bridge returned an invalid mutation response.";
}

const filters: readonly { value: PublicationFilter; label: string }[] = [
  { value: "all", label: "All notes" },
  { value: "public", label: "Public" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "unlisted", label: "Unlisted" },
  { value: "not-routable", label: "Not routable" },
  { value: "issues", label: "Issues" },
];

function toRow(
  file: TFile,
  result: Awaited<ReturnType<RiebeckitePlugin["editor"]["publication"]>>,
): PublicationRow {
  return result.kind === "resolved"
    ? {
        path: file.path,
        title: file.basename,
        publication: result.value,
        state: "resolved",
      }
    : {
        path: file.path,
        title: file.basename,
        publication: undefined,
        state:
          result.kind === "unavailable"
            ? "unavailable"
            : result.kind === "error"
              ? "error"
              : "unresolved",
      };
}
