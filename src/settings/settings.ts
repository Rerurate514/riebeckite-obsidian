export interface RiebeckiteSettings {
  serverUrl: string;
  bridgeToken: string;
}

export const defaultSettings: RiebeckiteSettings = {
  serverUrl: "http://127.0.0.1:3000",
  bridgeToken: "",
};

export function parseSettings(value: unknown): RiebeckiteSettings {
  if (typeof value !== "object" || value === null) {
    return defaultSettings;
  }

  const { serverUrl, bridgeToken } = value as Record<string, unknown>;

  try {
    const url = new URL(typeof serverUrl === "string" ? serverUrl : "");
    return (url.protocol === "http:" || url.protocol === "https:") &&
      isLoopbackHost(url.hostname)
      ? {
          serverUrl: url.toString().replace(/\/$/, ""),
          bridgeToken: typeof bridgeToken === "string" ? bridgeToken : "",
        }
      : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    /^127\.\d+\.\d+\.\d+$/.test(normalized)
  );
}
