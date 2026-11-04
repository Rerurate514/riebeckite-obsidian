import type { BridgePublication } from "../bridge/bridge-client";

export type PublicationRow = {
  path: string;
  title: string;
  publication: BridgePublication | undefined;
  state: "resolved" | "unresolved" | "unavailable" | "error";
};

export type PublicationFilter =
  | "all"
  | "public"
  | "draft"
  | "scheduled"
  | "unlisted"
  | "not-routable"
  | "issues";

export function filterPublications(
  rows: readonly PublicationRow[],
  filter: PublicationFilter,
  query: string,
): PublicationRow[] {
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const publication = row.publication;
    if (!matchesFilter(row, filter)) return false;
    return (
      !needle ||
      [
        row.title,
        row.path,
        publication?.permalink,
        publication?.canonicalUrl,
      ].some((value) => value?.toLocaleLowerCase().includes(needle))
    );
  });
}

export function impactReasonLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    "new-output": "新しい出力",
    "kind-changed": "出力種別の変更",
    "unknown-dependency": "不明な依存関係",
    external: "外部依存の変更",
    "derived-view": "派生ビューの変更",
    "derived-query": "派生クエリの変更",
    global: "グローバル依存の変更",
    content: "コンテンツの変更",
    tag: "タグの変更",
    folder: "フォルダーの変更",
    file: "ファイルの変更",
    "public-location": "公開先の変更",
    "content-query": "コンテンツクエリの変更",
    projection: "プロジェクションの変更",
    unavailable: "理由不明",
  };
  return labels[type] ?? type;
}

function matchesFilter(
  row: PublicationRow,
  filter: PublicationFilter,
): boolean {
  const publication = row.publication;
  if (filter === "all") return true;
  if (filter === "issues") return row.state !== "resolved";
  if (filter === "not-routable") return publication?.routable === false;
  return publication?.visibility === filter;
}
