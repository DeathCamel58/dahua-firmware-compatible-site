# Dahua Firmware Finder

Source for [dahua.randomcpu.com](https://dahua.randomcpu.com). It's a static site that shows which firmware files may be compatible with Dahua-made devices, including Amcrest and Lorex.

The site is built with [Astro](https://astro.build) and deployed to GitHub Pages.

## Data

At build time the site fetches two files from [amcrest-compatible-finder](https://github.com/DeathCamel58/amcrest-compatible-finder):

- `firmware_compatible.json`: firmware filename → device IDs found in the file
- `cameras.json`: firmware filename → download URL, notes and Amcrest model names

`src/lib/data.ts` loads both files once per build. It normalizes them into firmwares, devices, device families and Amcrest models, and gives each one a stable URL slug. The parsing of vendor, version and build date from filenames lives in `src/lib/parseFirmware.ts`.

## Pages

| Route | Content |
| --- | --- |
| `/firmware/<slug>/` | One page per firmware file |
| `/device/<slug>/` | One page per device ID |
| `/amcrest/<slug>/` | One page per Amcrest model |
| `/device/family/<slug>/`, `/firmware/year/<year>/` | Browse hubs |
| `/search/` | Client-side search |
| `/search-index.json` | Search index, generated at build time |
| `/camera/<Name>/`, `/firmware/<Raw_Name>/` | Redirect stubs for URLs from the old Next.js site |

Search runs entirely in the browser. The index (about 60 KB gzipped) is only downloaded once someone focuses a search box.

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
```

## Deployment

`.github/workflows/deploy.yml` builds and deploys the site:

- on every push to `main`
- once a day, to pick up data changes
- on demand, via a `data-updated` repository dispatch
