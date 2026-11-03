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
