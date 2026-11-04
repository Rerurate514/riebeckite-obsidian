import assert from "node:assert/strict";
import test from "node:test";
import { BridgeClient, type BridgeRequest } from "../src/bridge/bridge-client";
import { seoIssueLabel } from "../src/publication/publication-model";

const connectedStatus = {
  protocolVersion: 1,
  server: { id: "server", version: "0.0.38" },
  capabilities: ["publication"],
  development: {
    available: true,
    revision: 1,
    build: { status: "unavailable" },
  },
  inspection: { available: true },
};

function clientFor(seo: unknown, present = true): BridgeClient {
  return new BridgeClient(async (input) => {
    if (input.url.endsWith("/bootstrap"))
      return response({ origin: "http://127.0.0.1:4567" });
    if (input.url.endsWith("/v1")) return response(connectedStatus);
    return response({
      status: "resolved",
      entry: {
        source: { path: "notes/hello.md" },
        permalink: "/hello/",
        locale: "ja",
      },
      publication: {
        visibility: "public",
        routable: true,
        discoverable: true,
        publishAt: null,
        publicLocation: { permalink: "/hello/" },
        redirects: [],
        reasons: [],
        ...(present ? { seo } : {}),
      },
      revision: 2,
    });
  });
}

async function inspect(client: BridgeClient) {
  await client.connect("http://127.0.0.1:3000", "a".repeat(32));
  return client.inspectPublication("a".repeat(32), "notes/hello.md");
}

test("parses SEO data returned with a publication", async () => {
  const result = await inspect(
    clientFor({
      title: "Hello",
      description: "A note about hello",
      canonicalUrl: "https://example.com/hello/",
      indexable: true,
      issues: ["TITLE_TOO_LONG"],
    }),
  );

  assert.deepEqual(result.kind === "resolved" && result.value.seo, {
    title: "Hello",
    description: "A note about hello",
    canonicalUrl: "https://example.com/hello/",
    indexable: true,
    issues: ["TITLE_TOO_LONG"],
  });
});

test("keeps a publication readable when SEO data is absent", async () => {
  const result = await inspect(clientFor(undefined, false));

  assert.equal(result.kind, "resolved");
  assert.equal(result.kind === "resolved" && result.value.seo, undefined);
});

test("ignores malformed SEO data without failing the publication", async () => {
  for (const seo of [
    null,
    "unexpected",
    {
      title: 1,
      description: null,
      canonicalUrl: null,
      indexable: true,
      issues: [],
    },
    {
      title: "Hello",
      description: null,
      canonicalUrl: null,
      indexable: "yes",
      issues: [],
    },
    {
      title: "Hello",
      description: null,
      canonicalUrl: null,
      indexable: true,
      issues: [1],
    },
  ]) {
    const result = await inspect(clientFor(seo));

    assert.equal(result.kind, "resolved");
    assert.equal(result.kind === "resolved" && result.value.seo, undefined);
  }
});

test("translates SEO issue codes into readable labels", () => {
  assert.equal(seoIssueLabel("MISSING_DESCRIPTION"), "説明文がありません");
  assert.equal(seoIssueLabel("DESCRIPTION_TOO_LONG"), "説明文が長すぎます");
  assert.equal(seoIssueLabel("TITLE_TOO_LONG"), "タイトルが長すぎます");
  assert.equal(seoIssueLabel("NOT_INDEXABLE"), "検索対象外です");
  assert.equal(seoIssueLabel("UNKNOWN_ISSUE"), "UNKNOWN_ISSUE");
});

function response(json: unknown, status = 200) {
  return { status, json } as Awaited<ReturnType<BridgeRequest>>;
}
