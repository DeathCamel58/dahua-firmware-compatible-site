# Dahua Firmware Finder

Source for [dahua.randomcpu.com](https://dahua.randomcpu.com). It's a static site that shows which firmware files may be compatible with Dahua-made devices, including Amcrest and Lorex.

The site is built with [Astro](https://astro.build) and deployed to GitHub Pages.

## Data

The site's data comes from [amcrest-compatible-finder](https://github.com/DeathCamel58/amcrest-compatible-finder). The deploy workflow checks out just its data (a sparse checkout of the two JSON files and `data/`) and points `DATA_DIR` at it. Without `DATA_DIR` (e.g. a quick local build), the two JSON files are fetched from GitHub and technical details are skipped:

- `cameras.json`: per firmware file, where it came from: each vendor's listing (model names, notes, link, link status, first/last seen, whether it's the vendor's current firmware), the Internet Archive copy, checksums, size, platform and integrity
- `firmware_compatible.json`: the analysis index: per firmware file, its hardware IDs (sorted into models, boards, raw hex IDs and ignored tokens), analysis status, chips, and the path of its detail file
- `data/firmware/…` and `data/layouts/…`: per-firmware technical details (where each hardware ID came from, SoC, kernel, security baseline, partitions) and shared partition layouts

The format is documented in that repo's `docs/FIRMWARE_DATA.md`. `src/lib/raw.ts` reads it, and also still reads the original format (plain `camera_name`/`notes`/`url`, and plain ID lists), so the site builds against either. `src/lib/data.ts` turns it into the site's model: one page per firmware (identical copies fold into one page and redirect), devices from usable hardware IDs, retail models and vendors from the listings. Firmware analysed by extractor version 5+ also carries technical details (`hardware_sources` and `packages`: SoC, kernel, partitions, security baseline…), shown on firmware pages and used for the chip pages. Vendor logos live in `src/assets/logos/` (listed in `src/data/brands.json`) and are rendered with Astro's `<Image>`, which resizes rasters to WebP at build time.

## Pages

| Route | Content |
| --- | --- |
| `/firmware/<slug>/` | One page per firmware file (duplicates and old URLs redirect here) |
| `/device/<slug>/` | One page per hardware model or board family |
| `/model/<slug>/` | One page per retail model (the name on the box), with the vendors that list it |
| `/vendor/<slug>/` | One page per vendor: its current and previous firmware, and its models |
| `/soc/<slug>/` | One page per chip (SoC) identified inside the firmware, with its firmware and devices |
| `/device/family/<slug>/`, `/firmware/year/<year>/` | Browse hubs |
| `/new/`, `/feed.xml` | Newly added firmware (by first appearance on a vendor page) and its RSS feed |
| `/changelog/`, `/changelog/feed.xml` | Hand-written notes on what's new or changed, and their RSS feed |
| `/search/` | Client-side search |
| `/search-index.json` | Search index, generated at build time |
| `/camera/<Name>/`, `/firmware/<Raw_Name>/` | Redirect stubs for URLs from the old Next.js site |
| (various) | Redirects for every URL the site used to serve that no longer has its own page, listed in `src/data/legacy-urls.json` |

Long lists are paginated: firmware lists show 100 files per page (`/device/<slug>/2/`, `/soc/<slug>/2/`, `/firmware/year/<year>/2/`, `/vendor/<slug>/firmware/2/`) and device-family tables 250 devices. Retail models are browsed by brand at `/model/brand/<vendor>/`, and by series for very large brands.

Search runs entirely in the browser. The index is only downloaded once someone focuses a search box.

## Changelog

`/changelog/` (and `/changelog/feed.xml`) is built from Markdown files in `src/content/changelog/`, one per entry. Add a file such as `src/content/changelog/2026-11-01-new-vendor.md`:

```md
---
title: Added Uniview-made models from Example Vendor
date: 2026-11-01
category: data # site | data | fix
---

What changed, in a few sentences or a list. Links like [Newly added](/new/) work.
```

The newest entry also appears as a "New" link above the home page headline. Individual new firmware files don't need entries; `/new/` lists those automatically.

## Development

Requires Node 22.12 or newer.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
npm run preview
npm run check    # type-check
```

To build against local copies of the JSON files instead of fetching them, set `DATA_DIR`:

```bash
DATA_DIR=/path/to/amcrest-compatible-finder npm run build
# or against the documented examples, which cover every case the site handles:
DATA_DIR=/path/to/amcrest-compatible-finder/docs/examples npm run build
```

## Deployment

`.github/workflows/deploy.yml` builds and deploys the site:

- on every push to `main`
- once a day, to pick up data changes
- on demand, via a `data-updated` repository dispatch
