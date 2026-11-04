import type {
  BridgeConnectionState,
  BridgeIdentity,
} from "../bridge/bridge-client";
import type { ConnectionProfile, ContentMapping } from "./settings";

export type ConnectionTestResult =
  | { kind: "success"; identity: BridgeIdentity | undefined }
  | { kind: "unreachable" }
  | { kind: "authentication" }
  | { kind: "protocol" }
  | { kind: "loopback" };

export type IdentityCheck =
  | "matched"
  | "mismatch"
  | "unrecorded"
  | "unsupported";

export type MappingValidation = {
  errors: readonly string[];
  warnings: readonly string[];
};

export function classifyConnectionTest(
  serverUrl: string,
  state: BridgeConnectionState,
): ConnectionTestResult {
  if (!isLoopbackServerUrl(serverUrl)) return { kind: "loopback" };
  if (state.kind === "connected")
    return { kind: "success", identity: state.status.identity };
  if (state.kind === "unauthorized") return { kind: "authentication" };
  if (state.kind === "incompatible") return { kind: "protocol" };
  return { kind: "unreachable" };
}

export function checkSiteIdentity(
  profile: Pick<ConnectionProfile, "siteId">,
  identity: BridgeIdentity | undefined,
): IdentityCheck {
  if (!identity) return "unsupported";
  if (!profile.siteId) return "unrecorded";
  return profile.siteId === identity.siteId ? "matched" : "mismatch";
}

export function validateContentMappings(
  profiles: readonly ConnectionProfile[],
  existingFolders: ReadonlySet<string>,
): MappingValidation {
  const mappings = profiles.flatMap((profile) =>
    contentMappings(profile).map((mapping) => ({ profile, mapping })),
  );
  const errors = mappings
    .filter(({ mapping }) => !existingFolders.has(mapping.vaultFolder))
    .map(
      ({ profile, mapping }) =>
        `${profile.displayName}: Vault folder "${mapping.vaultFolder}" does not exist.`,
    );
  const duplicateFolders = new Set(
    mappings
      .map(({ mapping }) => mapping.vaultFolder)
      .filter((folder, index, folders) => folders.indexOf(folder) !== index),
  );
  return {
    errors,
    warnings: [...duplicateFolders].map(
      (folder) => `Vault folder "${folder}" is used by multiple mappings.`,
    ),
  };
}

export function contentMappings(
  profile: Pick<
    ConnectionProfile,
    "vaultFolder" | "contentRootId" | "contentMapping"
  >,
): readonly ContentMapping[] {
  if (profile.contentMapping?.length) return profile.contentMapping;
  return profile.vaultFolder
    ? [
        {
          vaultFolder: profile.vaultFolder,
          contentRootId: profile.contentRootId ?? "",
        },
      ]
    : [];
}

export function isLoopbackServerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (hostname === "localhost" ||
        hostname === "::1" ||
        /^127\.\d+\.\d+\.\d+$/.test(hostname))
    );
  } catch {
    return false;
  }
}
