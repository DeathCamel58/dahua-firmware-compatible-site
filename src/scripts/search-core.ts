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

/** Split a name or query into lowercase tokens at separators: "DHI-NVR5232" -> ["dhi", "nvr5232"]. */
export const tokenize = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

interface Prepared {
  entries: IndexEntry[];
  normalized: string[];
  /** Tokens of each name, built the first time the token pass needs them. */
  tokens?: string[][];
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

/** Shortest indexed token that may match as a prefix of a longer query token (so "NVR5" can't match "NVR5232"). */
const MIN_PREFIX_TOKEN = 4;
/** ...and it must cover this share of the query token: "hdbw1120e" matches "hdbw1120en", "xvr5108" doesn't match "xvr5108hs". */
const MIN_PREFIX_COVER = 0.8;

/** How well one query token matches one name token: 0 for no match, higher for a closer one. */
function tokenScore(queryToken: string, nameToken: string): number {
  if (queryToken === nameToken) return 3;
  // A partly typed token: "xvr51" -> "xvr5104c".
  if (nameToken.startsWith(queryToken)) return 2;
  // The name is the shorter one, e.g. a typed suffix the index doesn't have: "hdbw1120en" -> "hdbw1120e".
  if (
    queryToken.startsWith(nameToken) &&
    nameToken.length >= MIN_PREFIX_TOKEN &&
    nameToken.length >= queryToken.length * MIN_PREFIX_COVER
  ) {
    return 1;
  }
  return 0;
}

/**
 * Second pass, used only when the whole query matches nothing as written: match token by token, so a
 * prefix the index doesn't use doesn't sink the search ("DHI-NVR5232" finds "NVR5232-4KS2" and
 * "DH-NVR5232-I/L"). Tokens with digits (the model number) must all match; letter-only tokens such as
 * vendor prefixes are optional and only improve the ranking, so there is no list of prefixes to keep.
 * Returns a score per matching entry; more matched tokens, closer matches and shorter names rank higher.
 */
function tokenPass(index: Prepared, query: string): Map<number, number> {
  const queryTokens = tokenize(query);
  const withDigits = queryTokens.filter((token) => /\d/.test(token));
  const required = withDigits.length > 0 ? withDigits : queryTokens;
  const optional = queryTokens.filter((token) => !required.includes(token));
  index.tokens ??= index.entries.map((entry) => tokenize(entry[1]));

  const scores = new Map<number, number>();
  index.tokens.forEach((nameTokens, i) => {
    const best = (token: string) => {
      let top = 0;
      for (const nameToken of nameTokens) top = Math.max(top, tokenScore(token, nameToken));
      return top;
    };
    let score = 0;
    for (const token of required) {
      const match = best(token);
      if (match === 0) return;
      score += match * token.length;
    }
    for (const token of optional) score += best(token) * token.length;
    scores.set(i, score * 4 - Math.min(index.normalized[i].length, 100) / 2);
  });
  return scores;
}

export function search(index: Prepared, query: string, limit = 10): Result[] {
  return searchWithTotal(index, query, limit).results;
}

function toResult(index: Prepared, i: number, score: number): Result {
  const [type, display, slug, meta] = index.entries[i];
  return { type, name: display, href: `${TYPE_PATHS[type]}${slug}/`, meta: describe(type, meta), score: score + TYPE_BONUS[type] };
}

/** The best `limit` matches, plus how many matched in total (for analytics). */
export function searchWithTotal(index: Prepared, query: string, limit = 10): { results: Result[]; total: number } {
  const q = normalize(query);
  if (!q) return { results: [], total: 0 };
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
    results.push(toResult(index, i, score));
  });
  // Nothing matched as typed: try token by token. Only then, so a query that already finds its model
  // ("DH-XVR51") isn't flooded with every model that merely shares part of it.
  if (results.length === 0) {
    for (const [i, score] of tokenPass(index, query)) results.push(toResult(index, i, score));
  }

  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { results: results.slice(0, limit), total: results.length };
}
