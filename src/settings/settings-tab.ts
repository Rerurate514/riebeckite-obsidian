import { type App, PluginSettingTab, Setting, TFolder } from "obsidian";
import type RiebeckitePlugin from "../main";
import {
  type ConnectionTestResult,
  checkSiteIdentity,
  contentMappings,
  validateContentMappings,
} from "./connection-validation";
import {
  activeProfile,
  type ConnectionMode,
  type ConnectionProfile,
  type ContentMapping,
} from "./settings";

export class RiebeckiteSettingsTab extends PluginSettingTab {
  private connectionTest: ConnectionTestResult | undefined;

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
    const profiles = this.plugin.settings.profiles;
    const profileSetting = new Setting(containerEl)
      .setName("Connection profile")
      .setDesc(
        profiles.length === 0
          ? "No profile yet. Select Add to connect this vault to a Riebeckite site."
          : "Profiles keep pairing credentials separate for each site.",
      );
    if (profiles.length > 0) {
      profileSetting.addDropdown((dropdown) => {
        for (const candidate of profiles) {
          dropdown.addOption(candidate.id, candidate.displayName);
        }
        dropdown.setValue(profile?.id ?? "").onChange(async (id) => {
          await this.plugin.switchProfile(id);
          this.connectionTest = undefined;
          this.display();
        });
      });
    }
    profileSetting
      .addButton((button) =>
        button.setButtonText("Add").onClick(async () => {
          const created = newProfile();
          await this.plugin.updateSettings({
            profiles: [...this.plugin.settings.profiles, created],
            activeProfileId: created.id,
          });
          this.connectionTest = undefined;
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
            const remaining = this.plugin.settings.profiles.filter(
              (candidate) => candidate.id !== profile.id,
            );
            await this.plugin.updateSettings({ profiles: remaining });
            await this.plugin.switchProfile(remaining[0]?.id ?? "");
            this.connectionTest = undefined;
            this.display();
          }),
      );
    if (profile) this.displayProfile(profile);
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
    this.displayConnection(profile);
    new Setting(containerEl)
      .setName("Site project directory")
      .setDesc(
        "Local Riebeckite site project used by Start Dev. This is separate from the Vault content mapping.",
      )
      .addText((text) =>
        text
          .setPlaceholder("C:\\Sites\\my-riebeckite-site")
          .setValue(profile.siteProjectDirectory ?? "")
          .onChange(async (siteProjectDirectory) =>
            this.updateProfile({ siteProjectDirectory }),
          ),
      );
    if (profile.mode === "custom-mapping") {
      this.displayCustomMappings(profile);
    } else if (profile.mode !== "integrated") {
      this.displayMapping(profile);
    }
    this.displayMappingValidation();
    this.displayConnectionStatus();
    new Setting(containerEl)
      .setName("Bridge mutation token")
      .setDesc("Optional token for reviewed frontmatter mutation plans.")
      .addText((text) => {
        text.inputEl.type = "password";
        return text
          .setValue(profile.mutationToken ?? "")
          .onChange(async (mutationToken) => {
            await this.updateProfile({ mutationToken });
          });
      });
  }

  private displayConnection(profile: ConnectionProfile): void {
    const { containerEl } = this;
    new Setting(containerEl)
      .setName("Riebeckite Server URL")
      .setDesc("The local Riebeckite development server URL.")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:3000")
          .setValue(profile.serverUrl)
          .onChange(async (serverUrl) => this.updateProfile({ serverUrl })),
      );
    new Setting(containerEl)
      .setName("Bridge pairing token")
      .setDesc("The token supplied to riebeckite dev --bridge-token.")
      .addText((text) => {
        text.inputEl.type = "password";
        return text
          .setValue(profile.bridgeToken)
          .onChange(async (bridgeToken) => this.updateProfile({ bridgeToken }));
      });
    new Setting(containerEl)
      .setName("Test connection")
      .setDesc(this.connectionTestDescription(profile))
      .addButton((button) =>
        button.setButtonText("Test connection").onClick(async () => {
          button.setDisabled(true);
          this.connectionTest = await this.plugin.testConnection();
          this.display();
        }),
      );
  }

  private displayMapping(profile: ConnectionProfile): void {
    const { containerEl } = this;
    new Setting(containerEl)
      .setName("Vault folder")
      .setDesc("Folder mapped to the Riebeckite content root.")
      .addText((text) =>
        text
          .setValue(profile.vaultFolder ?? "")
          .onChange(async (vaultFolder) => this.updateProfile({ vaultFolder })),
      );
    new Setting(containerEl)
      .setName("Content root")
      .addText((text) =>
        text
          .setValue(profile.contentRootId ?? "")
          .onChange(async (contentRootId) =>
            this.updateProfile({ contentRootId }),
          ),
      );
  }

  private displayCustomMappings(profile: ConnectionProfile): void {
    const { containerEl } = this;
    containerEl.createEl("h3", { text: "Content mappings" });
    const mappings = contentMappings(profile);
    for (const [index, mapping] of mappings.entries()) {
      new Setting(containerEl)
        .setName(`Mapping ${index + 1}`)
        .addText((text) =>
          text
            .setPlaceholder("Vault folder")
            .setValue(mapping.vaultFolder)
            .onChange(async (vaultFolder) =>
              this.updateMappings(mappings, index, { vaultFolder }),
            ),
        )
        .addText((text) =>
          text
            .setPlaceholder("Content root")
            .setValue(mapping.contentRootId)
            .onChange(async (contentRootId) =>
              this.updateMappings(mappings, index, { contentRootId }),
            ),
        )
        .addButton((button) =>
          button.setButtonText("Remove").onClick(async () => {
            await this.updateProfile({
              contentMapping: mappings.filter(
                (_, itemIndex) => itemIndex !== index,
              ),
            });
            this.display();
          }),
        );
    }
    new Setting(containerEl).addButton((button) =>
      button.setButtonText("Add mapping").onClick(async () => {
        await this.updateProfile({
          contentMapping: [...mappings, { vaultFolder: "", contentRootId: "" }],
        });
        this.display();
      }),
    );
  }

  private displayMappingValidation(): void {
    const existingFolders = new Set(
      this.app.vault
        .getAllLoadedFiles()
        .filter((file): file is TFolder => file instanceof TFolder)
        .map((folder) => folder.path),
    );
    const validation = validateContentMappings(
      this.plugin.settings.profiles,
      existingFolders,
    );
    for (const error of validation.errors) {
      new Setting(this.containerEl).setName("Mapping error").setDesc(error);
    }
    for (const warning of validation.warnings) {
      new Setting(this.containerEl).setName("Mapping warning").setDesc(warning);
    }
  }

  private displayConnectionStatus(): void {
    const state = this.plugin.bridge.getState();
    const description =
      state.kind === "connected"
        ? `Riebeckite ${state.status.server.version}; Protocol v${state.status.protocolVersion}; ${state.status.capabilities.join(", ")}.`
        : state.kind === "disconnected" || state.kind === "connecting"
          ? state.kind
          : state.message;
    new Setting(this.containerEl)
      .setName("Connection status")
      .setDesc(description)
      .addButton((button) =>
        button.setButtonText("Connect").onClick(async () => {
          await this.plugin.connectBridge();
          this.display();
        }),
      )
      .addButton((button) =>
        button.setButtonText("Disconnect").onClick(() => {
          this.plugin.disconnectBridge();
          this.display();
        }),
      );
  }

  private connectionTestDescription(profile: ConnectionProfile): string {
    const result = this.connectionTest;
    if (!result)
      return "Tests the current URL and pairing token without saving a result.";
    if (result.kind === "success") {
      if (!result.identity)
        return "Connected. This Bridge does not provide site identity.";
      const identity = checkSiteIdentity(profile, result.identity);
      const site = `${result.identity.siteName} (${result.identity.siteId.slice(0, 8)})`;
      return identity === "mismatch"
        ? `Connected to ${site}. This profile may be connected to a different site.`
        : `Connected to ${site}.`;
    }
    return {
      unreachable: "Could not reach the Bridge.",
      authentication: "Pairing was rejected.",
      protocol: "Bridge Protocol v1 is not supported.",
      loopback: "Only a loopback server URL can be used.",
    }[result.kind];
  }

  private async updateMappings(
    mappings: readonly ContentMapping[],
    index: number,
    changes: Partial<ContentMapping>,
  ): Promise<void> {
    await this.updateProfile({
      contentMapping: mappings.map((mapping, itemIndex) =>
        itemIndex === index ? { ...mapping, ...changes } : mapping,
      ),
    });
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
    this.connectionTest = undefined;
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
