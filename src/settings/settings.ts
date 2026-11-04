export type ConnectionMode =
  | "integrated"
  | "separate-local"
  | "separate-git"
  | "custom-mapping";

export type ConnectionProfile = {
  id: string;
  displayName: string;
  mode: ConnectionMode;
  serverUrl: string;
  bridgeToken: string;
  mutationToken?: string;
  siteId?: string;
  contentRootId?: string;
  vaultFolder?: string;
  capabilityState?: readonly string[];
  contentMapping?: readonly ContentMapping[];
};

export type ContentMapping = {
  vaultFolder: string;
  contentRootId: string;
};

export interface RiebeckiteSettings {
  serverUrl: string;
  bridgeToken: string;
  profiles: readonly ConnectionProfile[];
  activeProfileId: string;
}

export const defaultSettings: RiebeckiteSettings = {
  serverUrl: "http://127.0.0.1:3000",
  bridgeToken: "",
  profiles: [],
  activeProfileId: "",
};

export function parseSettings(value: unknown): RiebeckiteSettings {
  if (typeof value !== "object" || value === null) return defaultSettings;
  const record = value as Record<string, unknown>;
  const legacy = parseConnection(record);
  const profiles: readonly ConnectionProfile[] = Array.isArray(record.profiles)
    ? record.profiles.flatMap(parseProfile)
    : legacy
      ? [
          {
            ...legacy,
            id: "default",
            displayName: "Riebeckite site",
            mode: "integrated" as const,
          },
        ]
      : [];
  const activeProfileId =
    typeof record.activeProfileId === "string" &&
    profiles.some((profile) => profile.id === record.activeProfileId)
      ? record.activeProfileId
      : (profiles[0]?.id ?? "");
  const active = profiles.find((profile) => profile.id === activeProfileId);
  return {
    serverUrl: active?.serverUrl ?? defaultSettings.serverUrl,
    bridgeToken: active?.bridgeToken ?? "",
    profiles,
    activeProfileId,
  };
}

export function activeProfile(
  settings: RiebeckiteSettings,
): ConnectionProfile | undefined {
  return settings.profiles.find(
    (profile) => profile.id === settings.activeProfileId,
  );
}

export function mapVaultPath(
  profile: ConnectionProfile | undefined,
  vaultPath: string,
): string | undefined {
  const path = normalizeContentPath(vaultPath);
  if (!path) return undefined;
  if (!profile || profile.mode === "integrated") return path;
  const mapping = contentMappings(profile).find(
    ({ vaultFolder }) =>
      path === vaultFolder || path.startsWith(`${vaultFolder}/`),
  );
  return mapping && path !== mapping.vaultFolder
    ? path.slice(mapping.vaultFolder.length + 1)
    : undefined;
}

export function mapContentPath(
  profile: ConnectionProfile | undefined,
  contentPath: string,
): string | undefined {
  const path = normalizeContentPath(contentPath);
  if (!path) return undefined;
  if (!profile || profile.mode === "integrated") return path;
  const mapping = contentMappings(profile)[0];
  return mapping ? `${mapping.vaultFolder}/${path}` : undefined;
}

function parseProfile(value: unknown): ConnectionProfile[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const connection = parseConnection(record);
  if (!connection || typeof record.id !== "string" || record.id.length === 0)
    return [];
  const mode = isMode(record.mode) ? record.mode : "integrated";
  return [
    {
      ...connection,
      id: record.id,
      displayName:
        typeof record.displayName === "string" && record.displayName.trim()
          ? record.displayName.trim()
          : "Riebeckite site",
      mode,
      siteId: optionalString(record.siteId),
      contentRootId: optionalString(record.contentRootId),
      vaultFolder: optionalVaultFolder(record.vaultFolder),
      capabilityState: Array.isArray(record.capabilityState)
        ? record.capabilityState.filter(
            (capability): capability is string =>
              typeof capability === "string",
          )
        : undefined,
      contentMapping: parseContentMappings(record.contentMapping),
    },
  ];
}

function parseContentMappings(
  value: unknown,
): readonly ContentMapping[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    return typeof record.vaultFolder === "string" &&
      typeof record.contentRootId === "string"
      ? [
          {
            vaultFolder: optionalVaultFolder(record.vaultFolder) ?? "",
            contentRootId: record.contentRootId,
          },
        ]
      : [];
  });
}

function contentMappings(
  profile: ConnectionProfile,
): readonly ContentMapping[] {
  if (profile.contentMapping?.length)
    return profile.contentMapping.filter(
      ({ vaultFolder }) => vaultFolder.length > 0,
    );
  return profile.vaultFolder
    ? [
        {
          vaultFolder: profile.vaultFolder,
          contentRootId: profile.contentRootId ?? "",
        },
      ]
    : [];
}

function parseConnection(
  value: Record<string, unknown>,
): Omit<ConnectionProfile, "id" | "displayName" | "mode"> | undefined {
  const serverUrl = normalizeServerUrl(value.serverUrl);
  const mutationToken = optionalString(value.mutationToken);
  return serverUrl
    ? {
        serverUrl,
        bridgeToken:
          typeof value.bridgeToken === "string" ? value.bridgeToken : "",
        ...(mutationToken ? { mutationToken } : {}),
      }
    : undefined;
}

function normalizeServerUrl(value: unknown): string | undefined {
  try {
    const url = new URL(typeof value === "string" ? value : "");
    return (url.protocol === "http:" || url.protocol === "https:") &&
      isLoopbackHost(url.hostname)
      ? url.toString().replace(/\/$/, "")
      : undefined;
  } catch {
    return undefined;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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

function isMode(value: unknown): value is ConnectionMode {
  return [
    "integrated",
    "separate-local",
    "separate-git",
    "custom-mapping",
  ].includes(String(value));
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    /^127\.\d+\.\d+\.\d+$/.test(normalized)
  );
}
