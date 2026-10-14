/** Decode %xx sequences when they are valid, otherwise return the input untouched. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Longest slug kept as is: each slug becomes a folder name, file systems refuse names over 255 bytes,
 * and some data "names" are really long lists of models run together. (The live site already has a
 * 252-character slug, so the limit can't be lower without changing its URL.)
 */
const MAX_SLUG = 252;

/** Short, stable hash (FNV-1a) so a shortened slug stays unique and the same on every build. */
function shortHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** Turn an arbitrary firmware/device name into a URL-safe slug. */
export function slugify(value: string): string {
  const slug = safeDecode(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (slug.length > MAX_SLUG) return `${slug.slice(0, MAX_SLUG - 10).replace(/[-.]+$/, "")}-${shortHash(slug)}`;
  return slug || "item";
}

/**
 * Assign unique slugs to a list of names. Names are processed in sorted order so the
 * same input always produces the same slugs, keeping URLs stable between builds.
 */
export function assignSlugs(names: Iterable<string>, reserved: Iterable<string> = []): Map<string, string> {
  const result = new Map<string, string>();
  // Reserved slugs are taken by other routes at the same level (e.g. /model/brand/).
  const used = new Set<string>(reserved);
  for (const name of [...new Set(names)].sort()) {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    result.set(name, slug);
  }
  return result;
}
