import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  type App,
  Notice,
  Platform,
  Plugin,
  requestUrl,
  type WorkspaceLeaf,
} from "obsidian";
import type {
  BridgeConnectionState,
  BridgeDiagnostic,
} from "./bridge/bridge-client";
import { BridgeClient } from "./bridge/bridge-client";
import { EditorApi } from "./bridge/editor-api";
import { DevServerController } from "./dev/dev-server-controller";
import {
  diagnosticDecorations,
  refreshDiagnosticDecorations,
} from "./diagnostics/diagnostic-decorations";
import {
  diagnosticsViewType,
  RiebeckiteDiagnosticsView,
} from "./diagnostics/diagnostics-view";
import { BridgePolling } from "./lifecycle/bridge-polling";
import { ResourceRegistry } from "./lifecycle/resource-registry";
import { previewViewType, RiebeckitePreviewView } from "./preview/preview-view";
import {
  publicationViewType,
  RiebeckitePublicationView,
} from "./publication/publication-view";
import { checkSiteIdentity } from "./settings/connection-validation";
import {
  activeSite,
  defaultSettings,
  mapContentPath,
  mapVaultPath,
  parseSettings,
  type RiebeckiteSettings,
  type SiteProject,
} from "./settings/settings";
import { RiebeckiteSettingsTab } from "./settings/settings-tab";
import {
  RiebeckiteWorkspaceView,
  workspaceViewType,
} from "./workspace/riebeckite-workspace-view";

export default class RiebeckitePlugin extends Plugin {
  settings: RiebeckiteSettings = defaultSettings;
  private readonly resources = new ResourceRegistry();
  readonly bridge = this.resources.add(
    new BridgeClient((input) => requestUrl(input)),
  );
  readonly devServer = this.resources.add(new DevServerController());
  readonly editor = new EditorApi(
    this.bridge,
    () => this.bridgeToken(),
    () => undefined,
    (path) => this.bridgeSource(path),
    () => false,
  );
  private readonly polling = new BridgePolling(
    async () => (await this.refreshBridgeStatus()).kind,
  );
  private readonly diagnostics = new Map<string, readonly BridgeDiagnostic[]>();
  private refreshTimer: number | undefined;

  async onload(): Promise<void> {
    try {
      this.settings = parseSettings(await this.loadData());
      this.addSettingTab(new RiebeckiteSettingsTab(this.app, this));
      this.registerView(
        previewViewType,
        (leaf) => new RiebeckitePreviewView(leaf, this),
      );
      this.registerView(
        workspaceViewType,
        (leaf) => new RiebeckiteWorkspaceView(leaf, this),
      );
      this.registerView(
        publicationViewType,
        (leaf) => new RiebeckitePublicationView(leaf, this),
      );
      this.registerView(
        diagnosticsViewType,
        (leaf) => new RiebeckiteDiagnosticsView(leaf, this),
      );
      this.registerEditorExtension(
        diagnosticDecorations(() => {
          const path = this.app.workspace.getActiveFile()?.path;
          return path ? (this.diagnostics.get(path) ?? []) : [];
        }),
      );
      this.registerEvent(
        this.app.workspace.on("active-leaf-change", () =>
          this.scheduleRefreshViews(),
        ),
      );
      this.registerEvent(
        this.app.vault.on("modify", () => this.scheduleRefreshViews()),
      );
      this.addCommand({
        id: "open",
        name: "Open",
        callback: () => void this.openWorkspace(),
      });
      this.addCommand({
        id: "choose-site-project",
        name: "Choose Site Project",
        callback: () => void this.chooseSiteProject(),
      });
      this.addCommand({
        id: "start-dev",
        name: "Start Dev",
        callback: () => void this.startDev(),
      });
      this.addCommand({
        id: "stop-dev",
        name: "Stop Dev",
        callback: () => void this.stopDev(),
      });
      this.addCommand({
        id: "restart-dev",
        name: "Restart Dev",
        callback: () => void this.restartDev(),
      });
      this.addCommand({
        id: "open-settings",
        name: "Open settings",
        callback: () => this.openSettings(),
      });
      this.addCommand({
        id: "open-publication-manager",
        name: "Open Publication Manager",
        callback: () => void this.openWorkspace("publication"),
      });
      this.addCommand({
        id: "open-diagnostics",
        name: "Open Document Diagnostics",
        callback: () => void this.openWorkspace("diagnostics"),
      });
      this.addCommand({
        id: "open-live-preview",
        name: "Open Live Preview",
        callback: () => void this.openWorkspace("preview"),
      });
      this.addCommand({
        id: "refresh-live-preview",
        name: "Refresh Live Preview",
        callback: () => void this.refreshPreviews(),
      });
      this.addCommand({
        id: "open-current-preview-in-browser",
        name: "Open Current Preview in Browser",
        callback: () => void this.openCurrentPreviewInBrowser(),
      });
    } catch (error) {
      console.error("Unable to load Riebeckite", error);
      new Notice(
        "Riebeckite could not be loaded. Check the console for details.",
      );
    }
  }

  onunload(): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.polling.stop();
    this.resources.dispose();
  }

  async updateSettings(settings: Partial<RiebeckiteSettings>): Promise<void> {
    this.settings = parseSettings({ ...this.settings, ...settings });
    await this.saveData(this.settings);
  }

  async switchSite(id: string): Promise<void> {
    if (!this.settings.sites.some((site) => site.id === id)) return;
    await this.stopDev();
    await this.updateSettings({ activeSiteId: id });
    await this.refreshViews();
  }

  async removeSite(id: string): Promise<void> {
    const sites = this.settings.sites.filter((site) => site.id !== id);
    if (this.settings.activeSiteId === id) await this.stopDev();
    await this.updateSettings({ sites, activeSiteId: sites[0]?.id ?? "" });
    await this.refreshViews();
  }

  async chooseSiteProject(): Promise<void> {
    const directory = await chooseDirectory();
    if (!directory) return;
    if (!isRiebeckiteProject(directory)) {
      new Notice(
        "This folder is not a compatible Riebeckite site project. Choose the folder containing riebeckite.config.ts and its local CLI.",
      );
      return;
    }
    const existing = this.settings.sites.find(
      (site) => site.projectDirectory === directory,
    );
    if (existing) {
      await this.switchSite(existing.id);
      return;
    }
    const site: SiteProject = {
      id: crypto.randomUUID(),
      displayName: basename(directory) || "Riebeckite site",
      projectDirectory: directory,
    };
    await this.updateSettings({
      sites: [...this.settings.sites, site],
      activeSiteId: site.id,
    });
    await this.refreshViews();
  }

  async connectBridge(silent = false): Promise<BridgeConnectionState> {
    const state = this.devServer.getState();
    const token = this.devServer.getToken();
    if (state.kind !== "running" || !token)
      return { kind: "unavailable", message: "Start Managed Dev to connect." };
    const connection = await this.bridge.connect(state.serverUrl, token);
    if (connection.kind === "connected") {
      const site = activeSite(this.settings);
      const identity = connection.status.identity;
      if (!site || !identity || identity.siteId !== state.siteId) {
        this.bridge.disconnect();
        return {
          kind: "unavailable",
          message: "Site identity could not be verified.",
        };
      }
      if (checkSiteIdentity(site, identity) === "mismatch") {
        this.bridge.disconnect();
        return {
          kind: "unavailable",
          message: "The running site does not match the selected project.",
        };
      }
      if (checkSiteIdentity(site, identity) === "unrecorded") {
        await this.updateSettings({
          sites: this.settings.sites.map((candidate) =>
            candidate.id === site.id
              ? {
                  ...candidate,
                  siteId: identity.siteId,
                  contentRootId: identity.contentRootId,
                }
              : candidate,
          ),
        });
      }
      this.polling.start();
      await this.refreshViews();
    }
    if (!silent && connection.kind !== "connected")
      new Notice(
        "Riebeckite could not connect to this managed development session.",
      );
    return connection;
  }

  disconnectBridge(): void {
    this.polling.stop();
    this.bridge.disconnect();
    void this.refreshViews();
  }

  bridgeSource(path: string): string | undefined {
    return mapVaultPath(activeSite(this.settings), path);
  }

  vaultPath(path: string): string | undefined {
    return mapContentPath(activeSite(this.settings), path);
  }

  serverUrl(): string {
    const state = this.devServer.getState();
    return state.kind === "running" ? state.serverUrl : "";
  }

  bridgeToken(): string {
    return this.devServer.getToken() ?? "";
  }

  setDiagnostics(path: string, diagnostics: readonly BridgeDiagnostic[]): void {
    this.diagnostics.set(path, diagnostics);
    refreshDiagnosticDecorations();
  }

  openSettings(): void {
    const app = this.app as App & {
      setting: { open(): void; openTabById(id: string): void };
    };
    app.setting.open();
    app.setting.openTabById(this.manifest.id);
  }

  async openPreview(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf | null;
    if (!leaf) return;
    await leaf.setViewState({ type: previewViewType, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async openWorkspace(
    tab?: "publication" | "diagnostics" | "preview",
  ): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(workspaceViewType)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: workspaceViewType, active: true });
    this.app.workspace.revealLeaf(leaf);
    if (tab) (leaf.view as RiebeckiteWorkspaceView).selectTab(tab);
  }

  activeMarkdownFile() {
    const file = this.app.workspace.getActiveFile();
    return file?.extension === "md" ? file : undefined;
  }

  async startDev(): Promise<void> {
    const site = activeSite(this.settings);
    if (!site) {
      new Notice("Choose a Site Project before starting development.");
      return;
    }
    if (!site.managedDevTrusted) {
      if (
        !window.confirm(
          `Start Riebeckite development for ${site.displayName}? This runs the local CLI in the selected project.`,
        )
      )
        return;
      await this.updateSettings({
        sites: this.settings.sites.map((candidate) =>
          candidate.id === site.id
            ? { ...candidate, managedDevTrusted: true }
            : candidate,
        ),
      });
    }
    if (!this.devServer.start(site.projectDirectory)) {
      new Notice(
        "Riebeckite could not start this site. Confirm that its local CLI and configuration are installed.",
      );
      return;
    }
    const removeListener = this.devServer.onChange(() => {
      const state = this.devServer.getState();
      if (state.kind !== "running") return;
      removeListener();
      void this.connectBridge(true);
    });
  }

  async stopDev(): Promise<void> {
    await this.devServer.stop();
    this.disconnectBridge();
  }

  async restartDev(): Promise<void> {
    const site = activeSite(this.settings);
    if (!site) return;
    if (!(await this.devServer.stop())) return;
    this.disconnectBridge();
    await this.startDev();
  }

  async refreshWorkspace(): Promise<void> {
    await this.refreshViews();
  }

  private async refreshBridgeStatus(): Promise<BridgeConnectionState> {
    const token = this.devServer.getToken();
    if (!token) return { kind: "disconnected" };
    const previousRevision = this.bridge.getRevision();
    const state =
      this.bridge.getState().kind === "connected"
        ? await this.bridge.refreshStatus(token)
        : await this.connectBridge(true);
    if (
      state.kind === "connected" &&
      state.status.development.revision !== previousRevision
    )
      await this.refreshViews();
    return state;
  }

  private async refreshPreviews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(previewViewType))
      await (leaf.view as RiebeckitePreviewView).refresh();
  }

  private async refreshViews(): Promise<void> {
    await this.refreshPreviews();
    for (const type of [publicationViewType, diagnosticsViewType]) {
      for (const leaf of this.app.workspace.getLeavesOfType(type))
        await (
          leaf.view as RiebeckitePublicationView | RiebeckiteDiagnosticsView
        ).refresh();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(workspaceViewType))
      (leaf.view as RiebeckiteWorkspaceView).refresh();
  }

  private scheduleRefreshViews(): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      refreshDiagnosticDecorations();
      void this.refreshViews();
    }, 150);
  }

  private async openCurrentPreviewInBrowser(): Promise<void> {
    const file = this.activeMarkdownFile();
    const source = file ? this.bridgeSource(file.path) : undefined;
    if (!source || this.bridge.getState().kind !== "connected") return;
    const result = await this.bridge.resolvePage(
      this.serverUrl(),
      this.bridgeToken(),
      source,
    );
    if (result.kind === "resolved" && result.page.routable)
      window.open(result.previewUrl, "_blank", "noopener");
  }
}

function isRiebeckiteProject(directory: string): boolean {
  return (
    [
      "riebeckite.config.ts",
      "riebeckite.config.js",
      "riebeckite.config.mjs",
    ].some((file) => existsSync(join(directory, file))) &&
    existsSync(
      join(
        directory,
        "node_modules",
        "@riebeckite",
        "cli",
        "bin",
        "riebeckite.mjs",
      ),
    )
  );
}

async function chooseDirectory(): Promise<string | undefined> {
  if (!Platform.isDesktopApp) {
    new Notice("Site project selection is available in Obsidian Desktop only.");
    return undefined;
  }
  try {
    const remote = (
      window as unknown as {
        require(name: string): {
          dialog: {
            showOpenDialog(
              options: unknown,
            ): Promise<{ canceled: boolean; filePaths: string[] }>;
          };
        };
      }
    ).require("@electron/remote");
    const result = await remote.dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.canceled ? undefined : result.filePaths[0];
  } catch {
    const entered = window.prompt(
      "Enter the full path of the Riebeckite site project.",
    );
    return entered?.trim() || undefined;
  }
}
