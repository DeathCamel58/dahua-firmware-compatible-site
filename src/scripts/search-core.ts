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

/** A lens code such as "0280B" or "0360": part of the order code, never part of the model. */
const LENS_CODE = /^0\d{3}b?$/;
/** The core model token has to be at least this long, so "s2" or "k35" alone can't pull in half the index. */
const MIN_CORE_TOKEN = 5;
/** Only devices and retail models are offered as similar; a firmware filename isn't a model. */
const SIMILAR_TYPES: ReadonlySet<EntryType> = new Set([TYPE_DEVICE, TYPE_MODEL]);
/** A firmware version ("V2.800.0000000.8.R") or filename: its tokens ("stream3") aren't model numbers. */
const FIRMWARE_QUERY = /\d\.\d{3}\.|\.(bin|zip)\b/i;

/**
 * Third pass, used only when the token pass finds nothing either: match on the main model token alone
 * ("HFW1230SP" in "DH-IPC-HFW1230SP-0280B"), so an order-code suffix or a variant the index doesn't
 * list (-S4 when it has -S5) no longer sinks a model that's there. The other tokens only improve the
 * ranking. These are similar models, not matches: -S4 and -S5 are different hardware generations and can
 * need different firmware, so callers must say so.
 */
function similarPass(index: Prepared, query: string): Map<number, number> {
  const scores = new Map<number, number>();
  if (FIRMWARE_QUERY.test(query)) return scores;
  const queryTokens = tokenize(query);
  const candidates = queryTokens.filter((token) => /\d/.test(token) && /[a-z]/.test(token) && !LENS_CODE.test(token));
  const core = candidates.reduce((longest, token) => (token.length > longest.length ? token : longest), "");
  if (core.length < MIN_CORE_TOKEN) return scores;
  const optional = queryTokens.filter((token) => token !== core && !LENS_CODE.test(token));
  index.tokens ??= index.entries.map((entry) => tokenize(entry[1]));

  index.tokens.forEach((nameTokens, i) => {
    if (!SIMILAR_TYPES.has(index.entries[i][0])) return;
    const best = (token: string) => {
      let top = 0;
      for (const nameToken of nameTokens) top = Math.max(top, tokenScore(token, nameToken));
      return top;
    };
    const coreMatch = best(core);
    if (coreMatch === 0) return;
    let score = coreMatch * core.length;
    for (const token of optional) score += best(token) * token.length;
    scores.set(i, score * 4 - Math.min(index.normalized[i].length, 100) / 2);
  });
  return scores;
}

export function search(index: Prepared, query: string, limit = 10): Result[] {
  return searchWithTotal(index, query, limit).results;
}

/**
 * Dahua's sale names add a P to the model token for the PAL version ("IPC-HDW5830RP-Z", "IPC-HDBW3441EP-S"), but
 * the device IDs inside the firmware usually leave it out ("IPC-HDW5830R-Z"). Only a P after a letter that follows
 * the model number counts, so "NVR4108-8P" (eight PoE ports) is left alone.
 */
const PAL_SUFFIX = /(?<![a-z0-9])([a-z]+\d+[a-z]*[a-z])p(?![a-z0-9])/g;
/** The P-less spelling of a query with a PAL sale name, or undefined when it has none. */
function withoutPal(query: string): string | undefined {
  const stripped = query.toLowerCase().replace(PAL_SUFFIX, "$1");
  return stripped === query.toLowerCase() ? undefined : stripped;
}
/** Ranks a match on the P-less spelling just under the same match as typed. */
const PAL_PENALTY = 50;

/** A hardware generation suffix: "-S2", "-S3". A later generation is different hardware and can need different firmware. */
const GENERATION = /^s\d$/;
/** Ranks "IPC-HFW2431T-ZS-S2" under "IPC-HFW2431T-ZS-2713" (a lens variant of the same camera) for "IPC-HFW2431T-ZS". */
const GENERATION_PENALTY = 30;

/** Exact, prefix and substring matches of the query as typed (separators ignored); a score per matching entry. */
function directPass(index: Prepared, query: string): Map<number, number> {
  const scores = new Map<number, number>();
  const q = normalize(query);
  if (!q) return scores;
  const tokens = query.split(/\s+/).map(normalize).filter(Boolean);
  index.normalized.forEach((name, i) => {
    if (name === q) {
      scores.set(i, 1000);
    } else if (name.startsWith(q)) {
      scores.set(i, 800 - Math.min(name.length - q.length, 200));
    } else {
      const position = name.indexOf(q);
      if (position >= 0) {
        scores.set(i, 500 - Math.min(position, 100) - Math.min(name.length, 100) / 2);
      } else if (tokens.length > 1 && tokens.every((token) => name.includes(token))) {
        scores.set(i, 250 - Math.min(name.length, 100) / 2);
      }
    }
  });
  return scores;
}

/** Ranks a name lower when it has a generation suffix the query didn't ask for. */
function generationPenalty(index: Prepared, i: number, queryTokens: string[]): number {
  const unasked = tokenize(index.entries[i][1]).some((token) => GENERATION.test(token) && !queryTokens.includes(token));
  return unasked ? GENERATION_PENALTY : 0;
}

function toResult(index: Prepared, i: number, score: number): Result {
  const [type, display, slug, meta] = index.entries[i];
  return { type, name: display, href: `${TYPE_PATHS[type]}${slug}/`, meta: describe(type, meta), score: score + TYPE_BONUS[type] };
}

/**
 * The best `limit` matches, plus how many matched in total (for analytics). `similar` is set when nothing
 * matched and the results are only similar models (see similarPass); `total` then counts those.
 */
export function searchWithTotal(
  index: Prepared,
  query: string,
  limit = 10,
): { results: Result[]; total: number; similar: boolean } {
  if (!normalize(query)) return { results: [], total: 0, similar: false };
  const queryTokens = tokenize(query);
  const pal = withoutPal(query);

  const scores = directPass(index, query);
  // A PAL sale name also finds the P-less device ID: "IPC-HDW5830RP-Z" finds "IPC-HDW5830R-Z", not only "...RP-Z-S2".
  if (pal) {
    for (const [i, score] of directPass(index, pal)) {
      scores.set(i, Math.max(scores.get(i) ?? -Infinity, score - PAL_PENALTY));
    }
  }
  // Nothing matched as typed: try token by token. Only then, so a query that already finds its model
  // ("DH-XVR51") isn't flooded with every model that merely shares part of it.
  if (scores.size === 0) {
    for (const [i, score] of tokenPass(index, query)) scores.set(i, score);
  }
  let similar = false;
  if (scores.size === 0) {
    for (const [i, score] of similarPass(index, query)) scores.set(i, score);
    similar = scores.size > 0;
  }

  const results = [...scores].map(([i, score]) => toResult(index, i, score - generationPenalty(index, i, queryTokens)));

  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { results: results.slice(0, limit), total: results.length, similar };
}
