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
  siteId?: string;
  contentRootId?: string;
  vaultFolder?: string;
  capabilityState?: readonly string[];
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
    },
  ];
}

function parseConnection(
  value: Record<string, unknown>,
): Omit<ConnectionProfile, "id" | "displayName" | "mode"> | undefined {
  const serverUrl = normalizeServerUrl(value.serverUrl);
  return serverUrl
    ? {
        serverUrl,
        bridgeToken:
          typeof value.bridgeToken === "string" ? value.bridgeToken : "",
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
  return typeof value === "string" && value.length > 0 && !value.includes("\0")
    ? value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
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
