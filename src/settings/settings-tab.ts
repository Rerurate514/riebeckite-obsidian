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
      text: "Local development server integration is not connected.",
    });

    new Setting(containerEl)
      .setName("Local server URL")
      .setDesc("Saved for a future Riebeckite local server connection.")
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
  }
}
