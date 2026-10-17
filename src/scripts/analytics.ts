/**
 * Google Analytics events. gtag only exists in production builds (see BaseLayout), so these calls do
 * nothing in dev.
 *
 * Parameter names and values are registered in GA4 (custom dimensions, a key event), so keep them
 * exactly as they are, and keep the value sets closed:
 *   firmware_download  firmware, download_source (archive|wayback|vendor), placement (page|list), link_domain
 *
 * Never name a parameter source, medium, campaign, term or content: GA4 reads those as the session's traffic
 * source. A download param called source turned organic sessions into "Unassigned / archive" (Oct 2026).
 *   search             search_term, results_count (number: every match, not just those shown),
 *                      placement (header|home|search page|404|listing; kept apart from the download values)
 *   select_content     content_type (device|model|firmware|chip), item_id, search_term
 *   search_no_results  search_term
 *   copy               copied_content (a label such as device_name or magicbox_url, never the copied text)
 */

type Params = Record<string, string | number | undefined>;

declare global {
  interface Window {
    gtag?: (command: "event", name: string, params?: Params) => void;
  }
}

/** GA4 truncates parameter values at 100 characters; cut them ourselves so it's predictable. */
const MAX_VALUE = 100;

export function track(name: string, params: Params = {}) {
  const clean: Params = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    clean[key] = typeof value === "string" ? value.slice(0, MAX_VALUE) : value;
  }
  window.gtag?.("event", name, clean);
}

/** Where a search box sits, by its input id. */
const SEARCH_PLACEMENTS: Record<string, string> = {
  "header-search": "header",
  "hero-search": "home",
  "page-search": "search page",
  // Searches from a 404 point at broken inbound links, so they get their own value.
  "notfound-search": "404",
  "compat-search": "listing",
  "model-search": "listing",
};

export function searchPlacement(input: HTMLInputElement): string {
  // An unmapped search box silently counts as "listing". When adding a box whose searches matter on their
  // own (another 404-style page, say), give it an id above and a placement value of its own.
  return SEARCH_PLACEMENTS[input.id] ?? "listing";
}

/** sessionStorage key for the last search recorded, so a search isn't counted twice across pages. */
const DEDUPE_KEY = "lastSearch";
/** Repeating the same term within this long counts as the same search. */
const DEDUPE_MS = 10_000;

/**
 * A search that was run: always `search` (zero results included), plus `search_no_results` when nothing
 * matched. A no-match query in a search box is recorded after a pause; if the user then presses Enter, the
 * /search/ page runs the same term again, so a repeat within DEDUPE_MS is dropped. That survives the page
 * change because it's kept in sessionStorage.
 */
export function trackSearch(searchTerm: string, resultsCount: number, placement: string) {
  const now = Date.now();
  try {
    const previous = JSON.parse(sessionStorage.getItem(DEDUPE_KEY) || "null");
    if (previous && previous.term === searchTerm && now - previous.ts < DEDUPE_MS) return;
    sessionStorage.setItem(DEDUPE_KEY, JSON.stringify({ term: searchTerm, ts: now }));
  } catch {
    // Storage unavailable (private mode, blocked): count it anyway.
  }
  track("search", { search_term: searchTerm, results_count: resultsCount, placement });
  if (resultsCount === 0) track("search_no_results", { search_term: searchTerm });
}

/**
 * Clicks that leave the page or copy something. One listener for the whole page:
 *  - <a data-download="filename" data-source="archive|wayback|vendor" data-placement="…"> -> firmware_download
 *  - search result rows (<a data-result-type data-result-name data-search-term>) -> select_content
 */
export function initClickTracking() {
  const onClick = (event: MouseEvent) => {
    // Left click and middle click (open in new tab) both count; right click doesn't.
    if (event.type === "auxclick" && event.button !== 1) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-download], a[data-result-name]");
    if (!link) return;
    if (link.dataset.download) {
      track("firmware_download", {
        firmware: link.dataset.download,
        download_source: link.dataset.source,
        placement: link.dataset.placement,
        link_domain: link.hostname,
      });
    } else {
      trackSelect(link);
    }
  };
  document.addEventListener("click", onClick);
  document.addEventListener("auxclick", onClick);
}

/** A search result was opened (by click, or Enter in the suggestions). */
export function trackSelect(row: HTMLAnchorElement) {
  // Picking a suggestion skips the search page, so the search itself is recorded here.
  const placement = row.dataset.searchPlacement;
  if (placement) trackSearch(row.dataset.searchTerm ?? "", Number(row.dataset.resultsCount), placement);
  track("select_content", {
    content_type: row.dataset.resultType,
    item_id: row.dataset.resultName,
    search_term: row.dataset.searchTerm,
  });
}
