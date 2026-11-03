export interface RiebeckiteSettings {
  serverUrl: string;
}

export const defaultSettings: RiebeckiteSettings = {
  serverUrl: "http://127.0.0.1:3000",
};

export function parseSettings(value: unknown): RiebeckiteSettings {
  if (typeof value !== "object" || value === null) {
    return defaultSettings;
  }

  const { serverUrl } = value as Record<string, unknown>;
  if (typeof serverUrl !== "string") {
    return defaultSettings;
  }

  try {
    const url = new URL(serverUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? { serverUrl: url.toString().replace(/\/$/, "") }
      : defaultSettings;
  } catch {
    return defaultSettings;
  }
}
