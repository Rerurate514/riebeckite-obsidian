import { type App, Notice, PluginSettingTab, Setting } from "obsidian";
import type RiebeckitePlugin from "../main";

export class RiebeckiteSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: RiebeckitePlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Riebeckite" });
    containerEl.createEl("p", {
      text: "Only loopback Riebeckite development servers can be connected.",
    });

    new Setting(containerEl)
      .setName("Riebeckite Server URL")
      .setDesc("The local Riebeckite development server URL.")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:3000")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (serverUrl) => {
            try {
              await this.plugin.updateSettings({ serverUrl });
            } catch (error) {
              console.error("Unable to save Riebeckite settings", error);
              new Notice("Riebeckite settings could not be saved.");
              text.setValue(this.plugin.settings.serverUrl);
            }
          }),
      );
    new Setting(containerEl)
      .setName("Bridge pairing token")
      .setDesc("The token supplied to riebeckite dev --bridge-token.")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.bridgeToken)
          .onChange(async (bridgeToken) => {
            try {
              await this.plugin.updateSettings({ bridgeToken });
            } catch (error) {
              console.error("Unable to save Riebeckite settings", error);
              new Notice("Riebeckite settings could not be saved.");
              text.setValue(this.plugin.settings.bridgeToken);
            }
          }),
      );
    const state = this.plugin.bridge.getState();
    const description =
      state.kind === "connected"
        ? `Riebeckite ${state.status.server.version}; Protocol v${state.status.protocolVersion}; ${state.status.capabilities.join(", ")}.`
        : state.kind === "disconnected" || state.kind === "connecting"
          ? state.kind
          : state.message;
    new Setting(containerEl)
      .setName("Connection Status")
      .setDesc(description)
      .addButton((button) =>
        button.setButtonText("Connect").onClick(async () => {
          await this.plugin.connectBridge();
          this.display();
        }),
      )
      .addButton((button) =>
        button.setButtonText("Disconnect").onClick(() => {
          this.plugin.bridge.disconnect();
          this.display();
        }),
      );
  }
}
