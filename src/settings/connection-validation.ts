import type { BridgeIdentity } from "../bridge/bridge-client";
import type { SiteProject } from "./settings";

export type IdentityCheck =
  | "matched"
  | "mismatch"
  | "unrecorded"
  | "unsupported";

export function checkSiteIdentity(
  site: Pick<SiteProject, "siteId">,
  identity: BridgeIdentity | undefined,
): IdentityCheck {
  if (!identity) return "unsupported";
  if (!site.siteId) return "unrecorded";
  return site.siteId === identity.siteId ? "matched" : "mismatch";
}
