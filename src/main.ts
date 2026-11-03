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
import { ResourceRegistry } from "./lifecycle/resource-registry";
import { previewViewType, RiebeckitePreviewView } from "./preview/preview-view";
import {
  defaultSettings,
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

  async onload(): Promise<void> {
    try {
      this.settings = parseSettings(await this.loadData());
      this.addSettingTab(new RiebeckiteSettingsTab(this.app, this));
      this.registerView(
        previewViewType,
        (leaf) => new RiebeckitePreviewView(leaf, this),
      );
      this.registerEvent(
        this.app.workspace.on(
          "active-leaf-change",
          () => void this.refreshPreviews(),
        ),
      );
      this.registerEvent(
        this.app.vault.on("modify", () => void this.refreshPreviews()),
      );
      this.addCommand({
        id: "open-settings",
        name: "Open settings",
        callback: () => this.openSettings(),
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
    this.resources.dispose();
  }

  async updateSettings(settings: Partial<RiebeckiteSettings>): Promise<void> {
    this.settings = parseSettings({ ...this.settings, ...settings });
    await this.saveData(this.settings);
  }

  async connectBridge(): Promise<BridgeConnectionState> {
    const state = await this.bridge.connect(
      this.settings.serverUrl,
      this.settings.bridgeToken,
    );
    new Notice(connectionMessage(state));
    return state;
  }

  async checkBridge(): Promise<BridgeConnectionState> {
    this.bridge.disconnect();
    return await this.connectBridge();
  }

  private openSettings(): void {
    const app = this.app as App & {
      setting: { open(): void; openTabById(id: string): void };
    };
    app.setting.open();
    app.setting.openTabById(this.manifest.id);
  }

  private async openPreview(): Promise<void> {
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

  private async openCurrentPreviewInBrowser(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || this.bridge.getState().kind !== "connected") return;
    const result = await this.bridge.resolvePage(
      this.settings.serverUrl,
      this.settings.bridgeToken,
      file.path,
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
