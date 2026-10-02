export const SITE_NAME = "Dahua Firmware Finder";
export const SITE_TAGLINE = "Find firmware that may be compatible with your Dahua, Amcrest or Lorex device";
export const CONTACT_URL = "https://ipcamtalk.com/members/deathcamel57.206868/";
export const DATA_REPO_URL = "https://github.com/DeathCamel58/amcrest-compatible-finder";
/** Google Analytics 4 measurement ID. */
export const GA_MEASUREMENT_ID = "G-3BRQFW74NY";
/** Every archived firmware, on the Internet Archive. */
export const ARCHIVE_COLLECTION_URL = "https://archive.org/search?query=subject%3A%22amcrest-compatible-finder%22";
export const SITE_REPO_URL = "https://github.com/DeathCamel58/dahua-firmware-compatible-site";

export const nav = [
  { name: "Devices", href: "/device/" },
  { name: "Firmware", href: "/firmware/" },
  { name: "Retail models", href: "/model/" },
  { name: "Vendors", href: "/vendor/" },
  { name: "New", href: "/new/" },
];

export const plural = (count: number, word: string, pluralWord = `${word}s`) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? word : pluralWord}`;

/** Search engines show roughly this many characters of a description. */
export const DESCRIPTION_LIMIT = 155;

/** Trim text to the description limit at a word boundary. */
export function clampDescription(text: string, limit = DESCRIPTION_LIMIT): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-]+$/, "")}…`;
}

/**
 * Build a description from a fixed part plus an optional list, keeping as many list items
 * as fit within the limit, e.g. "…, including A, B, C."
 */
export function describeWithList(base: string, items: string[], intro = "including", limit = DESCRIPTION_LIMIT): string {
  for (let count = items.length; count > 0; count--) {
    const text = `${base}, ${intro} ${items.slice(0, count).join(", ")}.`;
    if (text.length <= limit) return text;
  }
  return clampDescription(`${base}.`, limit);
}

/** A description sentence, or a list that is shortened to fit ("Sold as A, B and 3 more"). */
export type DescriptionPart = string | null | undefined | false | { lead: string; items: string[] };

/**
 * Build a meta description from sentences in priority order. The first part is always used
 * (clamped if needed); later ones are added only while they fit, and lists keep as many items
 * as fit. Nothing is cut off mid-sentence.
 */
export function composeDescription(parts: DescriptionPart[], limit = DESCRIPTION_LIMIT): string {
  const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    const candidates: string[] = [];
    if (typeof part === "string") candidates.push(sentence(part));
    else {
      const { lead, items } = part;
      for (let n = items.length; n > 0; n--) {
        const rest = items.length - n;
        candidates.push(sentence(`${lead} ${items.slice(0, n).join(", ")}${rest ? ` and ${rest} more` : ""}`));
      }
    }
    if (candidates.length === 0) continue;
    if (!out) {
      // Longest version that fits, else the shortest one clamped.
      out = clampDescription(candidates.find((c) => c.length <= limit) ?? candidates.at(-1)!, limit);
      continue;
    }
    const fit = candidates.find((c) => out.length + 1 + c.length <= limit);
    if (fit) out = `${out} ${fit}`;
  }
  return out;
}
