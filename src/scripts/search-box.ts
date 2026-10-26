import { searchPlacement, trackSearch, trackSelect } from "./analytics";
import { TYPE_LABELS, loadIndex, searchWithTotal, type EntryType, type Result } from "./search-core";

const MAX_SUGGESTIONS = 8;
/** How long a query with no matches has to sit before it counts as a failed search (not just a half-typed one). */
const NO_RESULTS_DELAY = 1500;
/** content_type values for analytics (a closed set registered in GA4). */
const CONTENT_TYPES: Record<EntryType, string> = { 0: "device", 1: "model", 2: "firmware", 3: "chip" };

/**
 * One search result link. `query` is recorded for analytics when it's opened. The suggestion dropdowns,
 * whose searches aren't otherwise tracked, also pass `search` (placement and total matches) so opening
 * the result records the search too.
 */
export function renderResultRow(
  result: Result,
  id?: string,
  query?: string,
  search?: { placement: string; total: number },
): HTMLAnchorElement {
  const row = document.createElement("a");
  row.href = result.href;
  row.dataset.resultType = CONTENT_TYPES[result.type];
  row.dataset.resultName = result.name;
  if (query) row.dataset.searchTerm = query;
  if (search) {
    row.dataset.searchPlacement = search.placement;
    row.dataset.resultsCount = String(search.total);
  }
  row.className =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-fg no-underline hover:bg-surface-2 hover:no-underline aria-selected:bg-accent-soft";
  if (id) {
    row.id = id;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
  }

  const text = document.createElement("span");
  text.className = "min-w-0 flex-1";
  const name = document.createElement("span");
  name.className = "block truncate font-mono text-sm";
  name.textContent = result.name;
  text.append(name);
  if (result.meta) {
    const meta = document.createElement("span");
    meta.className = "block text-xs text-muted";
    meta.textContent = result.meta;
    text.append(meta);
  }

  const badge = document.createElement("span");
  badge.className = "shrink-0 rounded bg-surface-2 px-2 py-0.5 text-xs text-muted";
  badge.textContent = TYPE_LABELS[result.type];

  row.append(text, badge);
  return row;
}

/**
 * Shown above similar-model results. Variants of one model (-S4 vs -S5) can be different hardware that
 * needs different firmware, so this has to stop anyone treating a near match as theirs.
 */
export function similarNotice(className: string): HTMLParagraphElement {
  const notice = document.createElement("p");
  notice.className = `${className} rounded-lg border border-warn/40 bg-warn-soft text-fg`;
  notice.textContent =
    "No exact match. These are similar models, not yours: check the full model number and hardware version (e.g. -S4 vs -S5) on the device's label or web page before flashing anything.";
  return notice;
}

function setupBox(form: HTMLFormElement) {
  if (form.dataset.suggest === "false") return;
  const input = form.querySelector<HTMLInputElement>('input[type="search"]')!;
  const list = form.querySelector<HTMLElement>('[role="listbox"]')!;
  let options: HTMLAnchorElement[] = [];
  let active = -1;
  let requestId = 0;
  let noResultsTimer: ReturnType<typeof setTimeout> | undefined;
  const placement = searchPlacement(input);

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const setActive = (index: number) => {
    options.forEach((option, i) => option.setAttribute("aria-selected", String(i === index)));
    active = index;
    if (index >= 0) {
      input.setAttribute("aria-activedescendant", options[index].id);
      options[index].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const update = async () => {
    const query = input.value.trim();
    const current = ++requestId;
    clearTimeout(noResultsTimer);
    if (!query) return close();

    let results: Result[];
    let total: number;
    let similar: boolean;
    try {
      ({ results, total, similar } = searchWithTotal(await loadIndex(), query, MAX_SUGGESTIONS));
    } catch {
      return close(); // index unavailable; the form still submits to /search/
    }
    if (current !== requestId) return; // a newer keystroke won

    // Similar models aren't matches, so analytics still records the search as finding nothing.
    const exactTotal = similar ? 0 : total;
    list.replaceChildren();
    options = results.map((result, i) =>
      renderResultRow(result, `${input.id}-option-${i}`, query, { placement, total: exactTotal }),
    );
    if (exactTotal === 0) {
      // No exact match: record the search and the miss (the user may not pick anything to trigger it).
      noResultsTimer = setTimeout(() => trackSearch(query, 0, placement), NO_RESULTS_DELAY);
    }
    if (options.length === 0) {
      const empty = document.createElement("p");
      empty.className = "px-3 py-3 text-sm text-muted";
      empty.textContent = "No matches. Try fewer characters, e.g. just the series (IPC-HDW2431).";
      list.append(empty);
    } else {
      if (similar) list.append(similarNotice("px-3 py-2 text-xs"));
      list.append(...options);
    }
    const all = document.createElement("a");
    all.href = `/search/?q=${encodeURIComponent(query)}`;
    all.className = "mt-1 block border-t border-border px-3 py-2 text-sm";
    all.textContent = `See all results for “${query}”`;
    list.append(all);

    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setActive(-1);
  };

  // Start downloading the index as soon as the user shows intent.
  input.addEventListener("focus", () => void loadIndex().catch(() => {}), { once: true });
  input.addEventListener("input", update);
  input.addEventListener("focus", () => input.value.trim() && update());
  input.addEventListener("keydown", (event) => {
    if (list.hidden) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      // Cycle through the options and back to the input (-1).
      let next = active + (event.key === "ArrowDown" ? 1 : -1);
      if (next >= options.length) next = -1;
      if (next < -1) next = options.length - 1;
      setActive(next);
    } else if (event.key === "Enter" && active >= 0 && options[active]) {
      event.preventDefault();
      trackSelect(options[active]);
      window.location.href = options[active].href;
    } else if (event.key === "Escape") {
      close();
    }
  });
  form.addEventListener("focusout", (event) => {
    if (!form.contains(event.relatedTarget as Node | null)) close();
  });
}

let initialized = false;

export function initSearchBoxes() {
  if (initialized) return;
  initialized = true;
  document.querySelectorAll<HTMLFormElement>("form[data-search]").forEach(setupBox);

  // "/" focuses the first search box, unless the user is already typing somewhere.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    const input = document.querySelector<HTMLInputElement>("form[data-search] input[type='search']");
    if (input) {
      event.preventDefault();
      input.focus();
    }
  });
}
