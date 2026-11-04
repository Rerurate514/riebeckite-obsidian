import { type App, Notice, PluginSettingTab, Setting } from "obsidian";
import type RiebeckitePlugin from "../main";
import {
  activeProfile,
  type ConnectionMode,
  type ConnectionProfile,
} from "./settings";

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
    const profile = activeProfile(this.plugin.settings);
    new Setting(containerEl)
      .setName("Connection profile")
      .setDesc("Profiles keep pairing credentials separate for each site.")
      .addDropdown((dropdown) => {
        for (const candidate of this.plugin.settings.profiles) {
          dropdown.addOption(candidate.id, candidate.displayName);
        }
        dropdown.setValue(profile?.id ?? "").onChange(async (id) => {
          await this.plugin.updateSettings({ activeProfileId: id });
          this.plugin.bridge.disconnect();
          this.display();
        });
      })
      .addButton((button) =>
        button.setButtonText("Add").onClick(async () => {
          const created = newProfile();
          await this.plugin.updateSettings({
            profiles: [...this.plugin.settings.profiles, created],
            activeProfileId: created.id,
          });
          this.display();
        }),
      )
      .addButton((button) =>
        button
          .setButtonText("Delete")
          .setWarning()
          .setDisabled(!profile || this.plugin.settings.profiles.length < 2)
          .onClick(async () => {
            if (!profile) return;
            const profiles = this.plugin.settings.profiles.filter(
              (candidate) => candidate.id !== profile.id,
            );
            await this.plugin.updateSettings({
              profiles,
              activeProfileId: profiles[0]?.id ?? "",
            });
            this.plugin.bridge.disconnect();
            this.display();
          }),
      );
    if (profile) this.displayProfile(profile);

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

  private displayProfile(profile: ConnectionProfile): void {
    const { containerEl } = this;
    new Setting(containerEl).setName("Profile name").addText((text) =>
      text.setValue(profile.displayName).onChange(async (displayName) => {
        await this.updateProfile({ displayName });
      }),
    );
    new Setting(containerEl)
      .setName("Connection mode")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("integrated", "Integrated")
          .addOption("separate-local", "Separate local")
          .addOption("separate-git", "Separate Git")
          .addOption("custom-mapping", "Custom mapping")
          .setValue(profile.mode)
          .onChange(async (mode) => {
            await this.updateProfile({ mode: mode as ConnectionMode });
            this.display();
          }),
      );
    if (profile.mode !== "integrated") {
      new Setting(containerEl)
        .setName("Vault folder")
        .setDesc("Folder mapped to the Riebeckite content root.")
        .addText((text) =>
          text
            .setValue(profile.vaultFolder ?? "")
            .onChange(async (vaultFolder) => {
              await this.updateProfile({ vaultFolder });
            }),
        );
    }
    new Setting(containerEl)
      .setName("Bridge mutation token")
      .setDesc("Optional token for reviewed frontmatter mutation plans.")
      .addText((text) =>
        text
          .setValue(profile.mutationToken ?? "")
          .onChange(async (mutationToken) => {
            await this.updateProfile({ mutationToken });
          }),
      );
  }

  private async updateProfile(
    changes: Partial<ConnectionProfile>,
  ): Promise<void> {
    const active = activeProfile(this.plugin.settings);
    if (!active) return;
    await this.plugin.updateSettings({
      profiles: this.plugin.settings.profiles.map((profile) =>
        profile.id === active.id ? { ...profile, ...changes } : profile,
      ),
    });
  }
}

function newProfile(): ConnectionProfile {
  return {
    id: crypto.randomUUID(),
    displayName: "New Riebeckite site",
    mode: "integrated",
    serverUrl: "http://127.0.0.1:3000",
    bridgeToken: "",
  };
}
