import type { ImageMetadata } from "astro";

/**
 * Vendor logos live in src/assets/logos/ so Astro's <Image> can resize them and convert rasters to
 * WebP at build time. brands.json names them by path relative to src/assets ("logos/dahua.svg").
 */
const files = import.meta.glob<{ default: ImageMetadata }>("/src/assets/logos/*.{svg,png,jpg,jpeg,webp}", { eager: true });

export function logoAsset(path: string | null | undefined): ImageMetadata | null {
  if (!path) return null;
  return files[`/src/assets/${path}`]?.default ?? null;
}
