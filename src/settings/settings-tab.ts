import { type App, PluginSettingTab, Setting } from "obsidian";
import type RiebeckitePlugin from "../main";
import { activeSite } from "./settings";

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
      text: "Choose a local Riebeckite site once, then manage development from the Riebeckite pane.",
    });
    const selected = activeSite(this.plugin.settings);
    new Setting(containerEl)
      .setName("Site project")
      .setDesc(selected ? selected.projectDirectory : "No site selected")
      .addDropdown((dropdown) => {
        for (const site of this.plugin.settings.sites)
          dropdown.addOption(site.id, site.displayName);
        dropdown.setValue(selected?.id ?? "").onChange(async (id) => {
          await this.plugin.switchSite(id);
          this.display();
        });
      })
      .addButton((button) =>
        button
          .setButtonText("Choose site project")
          .setCta()
          .onClick(async () => {
            await this.plugin.chooseSiteProject();
            this.display();
          }),
      )
      .addButton((button) =>
        button
          .setButtonText("Remove")
          .setWarning()
          .setDisabled(!selected)
          .onClick(async () => {
            if (!selected) return;
            await this.plugin.removeSite(selected.id);
            this.display();
          }),
      );
    if (selected) {
      new Setting(containerEl)
        .setName("Content mapping")
        .setDesc(
          selected.vaultFolder
            ? `Vault folder: ${selected.vaultFolder}`
            : "This vault (automatically mapped)",
        );
      new Setting(containerEl)
        .setName("Site identity")
        .setDesc(
          selected.siteId
            ? "Verified when Managed Dev connects."
            : "Will be verified when Managed Dev connects.",
        );
    }
  }
}
