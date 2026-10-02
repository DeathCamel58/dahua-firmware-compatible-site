/** Decode %xx sequences when they are valid, otherwise return the input untouched. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Turn an arbitrary firmware/device name into a URL-safe slug. */
export function slugify(value: string): string {
  const slug = safeDecode(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug || "item";
}

/**
 * Assign unique slugs to a list of names. Names are processed in sorted order so the
 * same input always produces the same slugs, keeping URLs stable between builds.
 */
export function assignSlugs(names: Iterable<string>): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (const name of [...new Set(names)].sort()) {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    result.set(name, slug);
  }
  return result;
}
