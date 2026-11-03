import { type App, Notice, Plugin, requestUrl } from "obsidian";
import {
  BridgeClient,
  type BridgeConnectionState,
} from "./bridge/bridge-client";
import { ResourceRegistry } from "./lifecycle/resource-registry";
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
      this.addCommand({
        id: "open-settings",
        name: "Open settings",
        callback: () => this.openSettings(),
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
