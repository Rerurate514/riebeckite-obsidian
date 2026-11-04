import {
  type App,
  Notice,
  Plugin,
  requestUrl,
  type WorkspaceLeaf,
} from "obsidian";
import type { BridgeDiagnostic } from "./bridge/bridge-client";
import {
  BridgeClient,
  type BridgeConnectionState,
} from "./bridge/bridge-client";
import { EditorApi } from "./bridge/editor-api";
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
import {
  type ConnectionTestResult,
  checkSiteIdentity,
  classifyConnectionTest,
  isLoopbackServerUrl,
} from "./settings/connection-validation";
import {
  activeProfile,
  defaultSettings,
  mapContentPath,
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
    () => activeProfile(this.settings)?.mutationToken,
    (path) => mapVaultPath(activeProfile(this.settings), path),
    () => this.canMutate(),
  );
  private refreshTimer: number | undefined;
  private readonly polling = new BridgePolling(
    async () => (await this.refreshBridgeStatus()).kind,
  );
  private readonly diagnostics = new Map<string, readonly BridgeDiagnostic[]>();

  async onload(): Promise<void> {
    try {
      this.settings = parseSettings(await this.loadData());
      this.addSettingTab(new RiebeckiteSettingsTab(this.app, this));
      this.registerView(
        previewViewType,
        (leaf) => new RiebeckitePreviewView(leaf, this),
      );
      this.registerEditorExtension(
        diagnosticDecorations(() => {
          const path = this.app.workspace.getActiveFile()?.path;
          return path ? (this.diagnostics.get(path) ?? []) : [];
        }),
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
          this.polling.stop();
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
    this.polling.stop();
    this.resources.dispose();
  }

  async updateSettings(settings: Partial<RiebeckiteSettings>): Promise<void> {
    const current = activeProfile(this.settings);
    const profiles =
      settings.profiles ??
      (current
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
        : this.settings.profiles);
    this.settings = parseSettings({ ...this.settings, ...settings, profiles });
    await this.saveData(this.settings);
  }

  async switchProfile(id: string): Promise<void> {
    this.polling.stop();
    await this.updateSettings({ activeProfileId: id });
    this.bridge.disconnect();
    await this.refreshViews();
  }

  async connectBridge(silent = false): Promise<BridgeConnectionState> {
    const profile = activeProfile(this.settings);
    const state = await this.bridge.connect(
      profile?.serverUrl ?? this.settings.serverUrl,
      profile?.bridgeToken ?? this.settings.bridgeToken,
    );
    if (state.kind === "connected") {
      this.polling.start();
      await this.refreshViews();
    }
    if (state.kind === "connected") {
      const currentProfile = activeProfile(this.settings);
      const identity = state.status.identity;
      if (currentProfile && identity) {
        const identityCheck = checkSiteIdentity(currentProfile, identity);
        if (identityCheck === "mismatch") {
          new Notice("This profile may be connected to a different site.");
        }
        if (identityCheck === "unrecorded") {
          await this.updateSettings({
            profiles: this.settings.profiles.map((candidate) =>
              candidate.id === currentProfile.id
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
    }
    if (!silent) new Notice(connectionMessage(state));
    return state;
  }

  async checkBridge(): Promise<BridgeConnectionState> {
    this.polling.stop();
    this.bridge.disconnect();
    return await this.connectBridge();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const profile = activeProfile(this.settings);
    const serverUrl = profile?.serverUrl ?? this.settings.serverUrl;
    const token = profile?.bridgeToken ?? this.settings.bridgeToken;
    if (!isLoopbackServerUrl(serverUrl))
      return classifyConnectionTest(serverUrl, { kind: "disconnected" });
    const state = await new BridgeClient((input) => requestUrl(input)).connect(
      serverUrl,
      token,
    );
    return classifyConnectionTest(serverUrl, state);
  }

  bridgeSource(path: string): string | undefined {
    return mapVaultPath(activeProfile(this.settings), path);
  }

  vaultPath(path: string): string | undefined {
    return mapContentPath(activeProfile(this.settings), path);
  }

  serverUrl(): string {
    return activeProfile(this.settings)?.serverUrl ?? this.settings.serverUrl;
  }

  bridgeToken(): string {
    return (
      activeProfile(this.settings)?.bridgeToken ?? this.settings.bridgeToken
    );
  }

  setDiagnostics(path: string, diagnostics: readonly BridgeDiagnostic[]): void {
    this.diagnostics.set(path, diagnostics);
    refreshDiagnosticDecorations();
  }

  private async refreshBridgeStatus(): Promise<BridgeConnectionState> {
    const profile = activeProfile(this.settings);
    const token = profile?.bridgeToken ?? this.settings.bridgeToken;
    const previousRevision = this.bridge.getRevision();
    const state =
      this.bridge.getState().kind === "connected"
        ? await this.bridge.refreshStatus(token)
        : await this.connectBridge(true);
    if (state.kind === "connected") {
      if (state.status.development.revision !== previousRevision)
        await this.refreshViews();
    }
    return state;
  }

  private canMutate(): boolean {
    const profile = activeProfile(this.settings);
    const state = this.bridge.getState();
    return !(
      profile?.siteId &&
      state.kind === "connected" &&
      state.status.identity &&
      checkSiteIdentity(profile, state.status.identity) === "mismatch"
    );
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
      refreshDiagnosticDecorations();
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
      this.serverUrl(),
      this.bridgeToken(),
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
