/**
 * Client-side search over the build-time index at /search-index.json.
 * Shared by the header/home search boxes and the /search/ results page.
 */

/** [type, name, slug, meta] — see src/pages/search-index.json.ts */
export type IndexEntry = [type: EntryType, name: string, slug: string, meta: string | number];
export type EntryType = 0 | 1 | 2 | 3;

export const TYPE_DEVICE = 0;
export const TYPE_MODEL = 1;
export const TYPE_FIRMWARE = 2;
export const TYPE_SOC = 3;

export const TYPE_LABELS: Record<EntryType, string> = {
  0: "Device",
  1: "Retail model",
  2: "Firmware",
  3: "Chip",
};

const TYPE_PATHS: Record<EntryType, string> = {
  0: "/device/",
  1: "/model/",
  2: "/firmware/",
  3: "/soc/",
};

// Model numbers matter more than the long filenames they appear in.
const TYPE_BONUS: Record<EntryType, number> = { 0: 30, 1: 30, 2: 0, 3: 20 };

export interface Result {
  type: EntryType;
  name: string;
  href: string;
  meta: string;
  score: number;
}

/** Lowercase and strip separators, so "ipc hdw2431" matches "IPC-HDW2431T-AS". */
export const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

interface Prepared {
  entries: IndexEntry[];
  normalized: string[];
}

let indexPromise: Promise<Prepared> | undefined;

export function loadIndex(): Promise<Prepared> {
  indexPromise ??= fetch("/search-index.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Search index: HTTP ${response.status}`);
      return response.json() as Promise<IndexEntry[]>;
    })
    .then((entries) => ({ entries, normalized: entries.map((entry) => normalize(entry[1])) }))
    .catch((error) => {
      indexPromise = undefined; // allow a retry on the next keystroke
      throw error;
    });
  return indexPromise;
}

function describe(type: EntryType, meta: string | number): string {
  if (type === TYPE_FIRMWARE) return meta ? `From ${meta}` : "";
  const count = Number(meta);
  return `${count.toLocaleString("en-US")} firmware${count === 1 ? "" : "s"}`;
}

export function search(index: Prepared, query: string, limit = 10): Result[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = query.split(/\s+/).map(normalize).filter(Boolean);

  const results: Result[] = [];
  index.normalized.forEach((name, i) => {
    let score: number;
    if (name === q) {
      score = 1000;
    } else if (name.startsWith(q)) {
      score = 800 - Math.min(name.length - q.length, 200);
    } else {
      const position = name.indexOf(q);
      if (position >= 0) {
        score = 500 - Math.min(position, 100) - Math.min(name.length, 100) / 2;
      } else if (tokens.length > 1 && tokens.every((token) => name.includes(token))) {
        score = 250 - Math.min(name.length, 100) / 2;
      } else {
        return;
      }
    }
    const [type, display, slug, meta] = index.entries[i];
    results.push({
      type,
      name: display,
      href: `${TYPE_PATHS[type]}${slug}/`,
      meta: describe(type, meta),
      score: score + TYPE_BONUS[type],
    });
  });

  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
