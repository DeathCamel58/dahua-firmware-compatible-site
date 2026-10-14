/**
 * Google Analytics events. gtag only exists in production builds (see BaseLayout), so these calls do
 * nothing in dev.
 *
 * Parameter names and values are registered in GA4 (custom dimensions, a key event), so keep them
 * exactly as they are, and keep the value sets closed:
 *   firmware_download  firmware, source (archive|wayback|vendor), placement (page|list), link_domain
 *   search             search_term, results_count (number), placement (header|home|page|search page)
 *   select_content     content_type (device|model|firmware|chip), item_id, search_term
 *   search_no_results  search_term
 *   copy               content (a label such as device_name or magicbox_url, never the copied text)
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

/** Where a search box sits: the header, the home page, or the body of some other page (404, model index…). */
export function searchPlacement(input: HTMLInputElement): string {
  if (input.id === "header-search") return "header";
  if (input.id === "hero-search") return "home";
  return "page";
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
        source: link.dataset.source,
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
  if (placement) track("search", { search_term: row.dataset.searchTerm, placement });
  track("select_content", {
    content_type: row.dataset.resultType,
    item_id: row.dataset.resultName,
    search_term: row.dataset.searchTerm,
  });
}
