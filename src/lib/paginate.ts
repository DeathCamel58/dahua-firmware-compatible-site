/** Firmware rows per page on any paginated firmware list (each row is about 1 KB of HTML). */
export const FIRMWARE_PAGE_SIZE = 100;
/** Device rows per page on device-family tables (rows are much smaller). */
export const DEVICE_PAGE_SIZE = 250;

export interface PageInfo<T> {
  page: number;
  pages: number;
  items: T[];
  /** 1-based index of the first item on this page. */
  from: number;
  /** 1-based index of the last item on this page. */
  to: number;
  total: number;
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

export function pageOf<T>(items: T[], page: number, size: number): PageInfo<T> {
  const pages = pageCount(items.length, size);
  const start = (page - 1) * size;
  const slice = items.slice(start, start + size);
  return { page, pages, items: slice, from: start + 1, to: start + slice.length, total: items.length };
}

/**
 * getStaticPaths entries for a paginated route `…/[...page]`: page 1 at the base URL (`page` undefined),
 * then `…/2/`, `…/3/`…
 */
export function pageParams(total: number, size: number): { page: string | undefined; number: number }[] {
  return Array.from({ length: pageCount(total, size) }, (_, i) => ({ page: i === 0 ? undefined : String(i + 1), number: i + 1 }));
}

/** URL of page `n` under a base path that ends in "/". */
export const pageUrl = (base: string, n: number) => (n <= 1 ? base : `${base}${n}/`);

/** " (page 2 of 5)" for titles; empty on single-page lists and page 1 of… nothing. */
export const pageSuffix = (page: number, pages: number) => (pages > 1 && page > 1 ? ` (page ${page} of ${pages})` : "");
