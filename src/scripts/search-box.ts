import { TYPE_LABELS, loadIndex, search, type Result } from "./search-core";

const MAX_SUGGESTIONS = 8;

export function renderResultRow(result: Result, id?: string): HTMLAnchorElement {
  const row = document.createElement("a");
  row.href = result.href;
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

function setupBox(form: HTMLFormElement) {
  if (form.dataset.suggest === "false") return;
  const input = form.querySelector<HTMLInputElement>('input[type="search"]')!;
  const list = form.querySelector<HTMLElement>('[role="listbox"]')!;
  let options: HTMLAnchorElement[] = [];
  let active = -1;
  let requestId = 0;

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
    if (!query) return close();

    let results: Result[];
    try {
      results = search(await loadIndex(), query, MAX_SUGGESTIONS);
    } catch {
      return close(); // index unavailable; the form still submits to /search/
    }
    if (current !== requestId) return; // a newer keystroke won

    list.replaceChildren();
    options = results.map((result, i) => renderResultRow(result, `${input.id}-option-${i}`));
    if (options.length === 0) {
      const empty = document.createElement("p");
      empty.className = "px-3 py-3 text-sm text-muted";
      empty.textContent = "No matches. Try fewer characters, e.g. just the series (IPC-HDW2431).";
      list.append(empty);
    } else {
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
