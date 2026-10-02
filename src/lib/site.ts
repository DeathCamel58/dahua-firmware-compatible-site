export const SITE_NAME = "Dahua Firmware Finder";
export const SITE_TAGLINE = "Find firmware that may be compatible with your Dahua, Amcrest or Lorex device";
export const CONTACT_URL = "https://ipcamtalk.com/members/deathcamel57.206868/";
export const DATA_REPO_URL = "https://github.com/DeathCamel58/amcrest-compatible-finder";
export const SITE_REPO_URL = "https://github.com/DeathCamel58/dahua-firmware-compatible-site";

export const nav = [
  { name: "Devices", href: "/device/" },
  { name: "Firmware", href: "/firmware/" },
  { name: "Retail models", href: "/model/" },
  { name: "How to", href: "/#how-to" },
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
