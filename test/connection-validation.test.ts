import assert from "node:assert/strict";
import test from "node:test";
import { checkSiteIdentity } from "../src/settings/connection-validation";

const identity = {
  siteId: "site",
  siteName: "Docs",
  contentRootId: "content",
  contentSourceKind: "integrated" as const,
};

test("site identity is only trusted after an exact match", () => {
  assert.equal(checkSiteIdentity({ siteId: "site" }, identity), "matched");
  assert.equal(checkSiteIdentity({ siteId: "other" }, identity), "mismatch");
  assert.equal(checkSiteIdentity({}, identity), "unrecorded");
  assert.equal(checkSiteIdentity({ siteId: "site" }, undefined), "unsupported");
});
