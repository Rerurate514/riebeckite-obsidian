import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPublications,
  impactReasonLabel,
  type PublicationRow,
} from "../src/publication/publication-model";

const rows: PublicationRow[] = [
  {
    path: "notes/public.md",
    title: "公開ノート",
    state: "resolved",
    publication: publication("public", true, "/public/"),
  },
  {
    path: "notes/draft.md",
    title: "Draft note",
    state: "resolved",
    publication: publication("draft", false, "/draft/"),
  },
  {
    path: "notes/missing.md",
    title: "Missing",
    state: "unresolved",
    publication: undefined,
  },
];

test("filters publication rows locally without a new Bridge request", () => {
  assert.deepEqual(
    filterPublications(rows, "draft", "").map((row) => row.path),
    ["notes/draft.md"],
  );
  assert.deepEqual(
    filterPublications(rows, "not-routable", "draft").map((row) => row.path),
    ["notes/draft.md"],
  );
  assert.deepEqual(
    filterPublications(rows, "issues", "").map((row) => row.path),
    ["notes/missing.md"],
  );
});

test("finds publication, SEO, and diagnostic issues in the attention filter", () => {
  const [publicRow, ...otherRows] = rows;
  assert.ok(publicRow?.publication);
  const rowsWithSeo = [
    {
      ...publicRow,
      publication: {
        ...publicRow.publication,
        seo: {
          title: "Public",
          description: null,
          canonicalUrl: null,
          indexable: true,
          issues: ["MISSING_DESCRIPTION"],
        },
      },
    },
    ...otherRows,
  ];
  const diagnostics = new Map([["notes/draft.md", "2 issue(s)"]]);

  assert.deepEqual(
    filterPublications(rowsWithSeo, "needs-attention", "", diagnostics).map(
      (row) => row.path,
    ),
    ["notes/public.md", "notes/draft.md", "notes/missing.md"],
  );
});

test("maps known impact reasons and preserves unknown types", () => {
  assert.equal(impactReasonLabel("content"), "コンテンツの変更");
  assert.equal(impactReasonLabel("unavailable"), "理由不明");
  assert.equal(impactReasonLabel("future-reason"), "future-reason");
});

function publication(
  visibility: "public" | "unlisted" | "draft" | "scheduled",
  routable: boolean,
  permalink: string,
): NonNullable<PublicationRow["publication"]> {
  return {
    source: "notes/example.md",
    permalink,
    locale: null,
    visibility,
    routable,
    discoverable: visibility === "public",
    publishAt: null,
    publicLocation: { permalink },
    canonicalUrl: null,
    redirects: [],
    reasons: [],
    revision: 1,
  };
}
