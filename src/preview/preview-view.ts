import { ItemView, type WorkspaceLeaf } from "obsidian";
import type RiebeckitePlugin from "../main";

export const previewViewType = "riebeckite-live-preview";

export class RiebeckitePreviewView extends ItemView {
  private request = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RiebeckitePlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return previewViewType;
  }

  getDisplayText(): string {
    return "Riebeckite Preview";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const request = ++this.request;
    const container = this.contentEl;
    container.empty();
    const file = this.app.workspace.getActiveFile();
    if (!file?.path.toLowerCase().endsWith(".md")) {
      container.createEl("p", { text: "Open a Markdown note to preview it." });
      return;
    }
    if (this.plugin.bridge.getState().kind !== "connected") {
      container.createEl("p", { text: "Riebeckite is not connected." });
      return;
    }
    const result = await this.plugin.bridge.resolvePage(
      this.plugin.settings.serverUrl,
      this.plugin.settings.bridgeToken,
      file.path,
    );
    if (request !== this.request) return;
    if (result.kind !== "resolved") {
      container.createEl("p", {
        text:
          result.kind === "not-found"
            ? "This note is not a Riebeckite content page."
            : "Riebeckite could not resolve this note.",
      });
      return;
    }
    const status = container.createEl("div", {
      cls: "riebeckite-preview-status",
    });
    status.setText(
      `${result.page.visibility} · ${result.page.locale ?? "default locale"} · ${result.page.routable ? "routable" : "not routable"}`,
    );
    container.createEl("p", {
      text: `Preview: ${result.page.routable ? result.previewUrl : "Not available"}`,
    });
    container.createEl("p", {
      text: `Public URL: ${result.page.productionUrl ?? "Not configured"}`,
    });
    const actions = container.createDiv({ cls: "riebeckite-preview-actions" });
    actions.createEl("button", { text: "Refresh" }).onclick = () =>
      void this.refresh();
    if (result.page.routable) {
      actions.createEl("button", { text: "Open in browser" }).onclick = () =>
        window.open(result.previewUrl, "_blank", "noopener");
    }
    if (result.page.productionUrl) {
      actions.createEl("button", { text: "Copy public URL" }).onclick = () =>
        void navigator.clipboard.writeText(result.page.productionUrl as string);
    }
    if (!result.page.routable) {
      container.createEl("p", {
        text: "This note is not routable, so no live preview is available.",
      });
      return;
    }
    const frame = container.createEl("iframe", {
      cls: "riebeckite-preview-frame",
    });
    frame.setAttribute("sandbox", "allow-forms allow-popups allow-scripts");
    frame.setAttribute("title", "Riebeckite live preview");
    frame.src = result.previewUrl;
  }
}
