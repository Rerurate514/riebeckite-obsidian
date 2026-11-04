export type SiteProject = {
  readonly id: string;
  readonly displayName: string;
  readonly projectDirectory: string;
  readonly vaultFolder?: string;
  readonly siteId?: string;
  readonly contentRootId?: string;
  readonly managedDevTrusted?: boolean;
};

export interface RiebeckiteSettings {
  readonly sites: readonly SiteProject[];
  readonly activeSiteId: string;
}

export const defaultSettings: RiebeckiteSettings = {
  sites: [],
  activeSiteId: "",
};

export function parseSettings(value: unknown): RiebeckiteSettings {
  if (!value || typeof value !== "object") return defaultSettings;
  const record = value as Record<string, unknown>;
  const sites = Array.isArray(record.sites)
    ? record.sites.flatMap(parseSite)
    : Array.isArray(record.profiles)
      ? record.profiles.flatMap(parseLegacyProfile)
      : [];
  const activeSiteId =
    typeof record.activeSiteId === "string" &&
    sites.some((site) => site.id === record.activeSiteId)
      ? record.activeSiteId
      : typeof record.activeProfileId === "string" &&
          sites.some((site) => site.id === record.activeProfileId)
        ? record.activeProfileId
        : (sites[0]?.id ?? "");
  return { sites, activeSiteId };
}

export function activeSite(
  settings: RiebeckiteSettings,
): SiteProject | undefined {
  return settings.sites.find((site) => site.id === settings.activeSiteId);
}

export function mapVaultPath(
  site: SiteProject | undefined,
  vaultPath: string,
): string | undefined {
  const path = normalizeContentPath(vaultPath);
  if (!path) return undefined;
  if (!site?.vaultFolder) return path;
  return path === site.vaultFolder
    ? undefined
    : path.startsWith(`${site.vaultFolder}/`)
      ? path.slice(site.vaultFolder.length + 1)
      : undefined;
}

export function mapContentPath(
  site: SiteProject | undefined,
  contentPath: string,
): string | undefined {
  const path = normalizeContentPath(contentPath);
  if (!path) return undefined;
  return site?.vaultFolder ? `${site.vaultFolder}/${path}` : path;
}

function parseSite(value: unknown): SiteProject[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const id = optionalString(record.id);
  const projectDirectory = optionalProjectDirectory(record.projectDirectory);
  if (!id || !projectDirectory) return [];
  return [
    {
      id,
      projectDirectory,
      displayName: optionalString(record.displayName) ?? "Riebeckite site",
      vaultFolder: optionalVaultFolder(record.vaultFolder),
      siteId: optionalString(record.siteId),
      contentRootId: optionalString(record.contentRootId),
      managedDevTrusted: record.managedDevTrusted === true,
    },
  ];
}

function parseLegacyProfile(value: unknown): SiteProject[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return parseSite({
    id: record.id,
    displayName: record.displayName,
    projectDirectory: record.siteProjectDirectory,
    vaultFolder: record.vaultFolder,
    siteId: record.siteId,
    contentRootId: record.contentRootId,
    managedDevTrusted: record.managedDevTrusted,
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalProjectDirectory(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() && !value.includes("\0")
    ? value.trim()
    : undefined;
}

function optionalVaultFolder(value: unknown): string | undefined {
  return typeof value === "string" ? normalizeContentPath(value) : undefined;
}

function normalizeContentPath(value: string): string | undefined {
  const path = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return path &&
    !path.includes("\0") &&
    !path.split("/").some((part) => !part || part === "." || part === "..")
    ? path
    : undefined;
}
