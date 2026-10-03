import { getCollection, type CollectionEntry } from "astro:content";

export type ChangelogEntry = CollectionEntry<"changelog">;

export const CATEGORY_LABELS: Record<ChangelogEntry["data"]["category"], string> = {
  site: "Site",
  data: "Data",
  fix: "Fix",
};

/** All changelog entries, newest first. */
export async function getChangelog(): Promise<ChangelogEntry[]> {
  const entries = await getCollection("changelog");
  return entries.sort((a, b) => (a.data.date === b.data.date ? a.id.localeCompare(b.id) : a.data.date < b.data.date ? 1 : -1));
}

/** Stable anchor for an entry on /changelog/, from its file name. */
export const changelogAnchor = (entry: ChangelogEntry) => entry.id.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
