import {
  type App,
  Notice,
  Plugin,
  requestUrl,
  type WorkspaceLeaf,
} from "obsidian";
import {
  BridgeClient,
  type BridgeConnectionState,
} from "./bridge/bridge-client";
import { EditorApi } from "./bridge/editor-api";
import {
  diagnosticsViewType,
  RiebeckiteDiagnosticsView,
} from "./diagnostics/diagnostics-view";
import { ResourceRegistry } from "./lifecycle/resource-registry";
import { previewViewType, RiebeckitePreviewView } from "./preview/preview-view";
import {
  publicationViewType,
  RiebeckitePublicationView,
} from "./publication/publication-view";
import {
  activeProfile,
  defaultSettings,
  mapVaultPath,
  parseSettings,
  type RiebeckiteSettings,
} from "./settings/settings";
import { RiebeckiteSettingsTab } from "./settings/settings-tab";

export default class RiebeckitePlugin extends Plugin {
  settings: RiebeckiteSettings = defaultSettings;
  private readonly resources = new ResourceRegistry();
  readonly bridge = this.resources.add(
    new BridgeClient((input) => requestUrl(input)),
  );
  readonly editor = new EditorApi(
    this.bridge,
    () =>
      activeProfile(this.settings)?.bridgeToken ?? this.settings.bridgeToken,
    (path) => mapVaultPath(activeProfile(this.settings), path),
  );
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
        publicationViewType,
        (leaf) => new RiebeckitePublicationView(leaf, this),
      );
      this.registerView(
        diagnosticsViewType,
        (leaf) => new RiebeckiteDiagnosticsView(leaf, this),
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
        id: "open-settings",
        name: "Open settings",
        callback: () => this.openSettings(),
      });
      this.addCommand({
        id: "open-publication-manager",
        name: "Open Publication Manager",
        callback: () => void this.openPublication(),
      });
      this.addCommand({
        id: "open-diagnostics",
        name: "Open Document Diagnostics",
        callback: () => void this.openDiagnostics(),
      });
      this.addCommand({
        id: "open-live-preview",
        name: "Open Live Preview",
        callback: () => void this.openPreview(),
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
      this.addCommand({
        id: "connect",
        name: "Connect to Riebeckite",
        callback: () => void this.connectBridge(),
      });
      this.addCommand({
        id: "disconnect",
        name: "Disconnect from Riebeckite",
        callback: () => {
          this.bridge.disconnect();
          void this.refreshViews();
          new Notice("Disconnected from Riebeckite.");
        },
      });
      this.addCommand({
        id: "check-connection",
        name: "Check Riebeckite Connection",
        callback: () => void this.checkBridge(),
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
    this.resources.dispose();
  }

  async updateSettings(settings: Partial<RiebeckiteSettings>): Promise<void> {
    const current = activeProfile(this.settings);
    const profiles = current
      ? this.settings.profiles.map((profile) =>
          profile.id === current.id
            ? {
                ...profile,
                ...(typeof settings.serverUrl === "string"
                  ? { serverUrl: settings.serverUrl }
                  : {}),
                ...(typeof settings.bridgeToken === "string"
                  ? { bridgeToken: settings.bridgeToken }
                  : {}),
              }
            : profile,
        )
      : this.settings.profiles;
    this.settings = parseSettings({ ...this.settings, ...settings, profiles });
    await this.saveData(this.settings);
  }

  async connectBridge(): Promise<BridgeConnectionState> {
    const profile = activeProfile(this.settings);
    const state = await this.bridge.connect(
      profile?.serverUrl ?? this.settings.serverUrl,
      profile?.bridgeToken ?? this.settings.bridgeToken,
    );
    if (state.kind === "connected") await this.refreshViews();
    if (state.kind === "connected") {
      const profile = activeProfile(this.settings);
      const identity = state.status.identity;
      if (profile && identity) {
        await this.updateSettings({
          profiles: this.settings.profiles.map((candidate) =>
            candidate.id === profile.id
              ? {
                  ...candidate,
                  siteId: identity.siteId,
                  contentRootId: identity.contentRootId,
                  capabilityState: state.status.capabilities,
                }
              : candidate,
          ),
        });
      }
    }
    new Notice(connectionMessage(state));
    return state;
  }

  async checkBridge(): Promise<BridgeConnectionState> {
    this.bridge.disconnect();
    return await this.connectBridge();
  }

  bridgeSource(path: string): string | undefined {
    return mapVaultPath(activeProfile(this.settings), path);
  }

  private openSettings(): void {
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

  private async refreshPreviews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(previewViewType)) {
      await (leaf.view as RiebeckitePreviewView).refresh();
    }
  }

  private async refreshViews(): Promise<void> {
    await this.refreshPreviews();
    for (const type of [publicationViewType, diagnosticsViewType]) {
      for (const leaf of this.app.workspace.getLeavesOfType(type)) {
        await (
          leaf.view as RiebeckitePublicationView | RiebeckiteDiagnosticsView
        ).refresh();
      }
    }
  }

  private scheduleRefreshViews(): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refreshViews();
    }, 150);
  }

  private async openPublication(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf | null;
    if (!leaf) return;
    await leaf.setViewState({ type: publicationViewType, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private async openDiagnostics(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf | null;
    if (!leaf) return;
    await leaf.setViewState({ type: diagnosticsViewType, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private async openCurrentPreviewInBrowser(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || this.bridge.getState().kind !== "connected") return;
    const source = this.bridgeSource(file.path);
    if (!source) {
      new Notice("This note is outside the profile's mapped vault folder.");
      return;
    }
    const result = await this.bridge.resolvePage(
      activeProfile(this.settings)?.serverUrl ?? this.settings.serverUrl,
      activeProfile(this.settings)?.bridgeToken ?? this.settings.bridgeToken,
      source,
    );
    if (result.kind === "resolved" && result.page.routable) {
      window.open(result.previewUrl, "_blank", "noopener");
    }
  }
}

function connectionMessage(state: BridgeConnectionState): string {
  return state.kind === "connected"
    ? `Connected to Riebeckite ${state.status.server.version}.`
    : state.kind === "disconnected"
      ? "Disconnected from Riebeckite."
      : state.kind === "connecting"
        ? "Connecting to Riebeckite."
        : state.message;
}
