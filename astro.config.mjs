// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * @astrojs/sitemap only writes sitemap-index.xml + sitemap-N.xml. Also publish the
 * conventional /sitemap.xml: the full URL list while it fits in one file (50,000 URLs),
 * otherwise a copy of the index.
 * @returns {import("astro").AstroIntegration}
 */
function sitemapXml() {
  return {
    name: "sitemap-xml",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const chunks = (await readdir(out)).filter((f) => /^sitemap-\d+\.xml$/.test(f));
        const source = chunks.length === 1 ? chunks[0] : "sitemap-index.xml";
        await copyFile(`${out}/${source}`, `${out}/sitemap.xml`);
        logger.info(`sitemap.xml written from ${source}`);
      },
    },
  };
}

export default defineConfig({
  site: "https://dahua.randomcpu.com",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  integrations: [
    sitemap({
      // Leave out the search page and the legacy redirect stubs (old /camera/ URLs, and old
      // /firmware/<Raw_Name>/ URLs, recognisable because new slugs are lowercase without "_").
      filter: (page) => {
        const { pathname } = new URL(page);
        return !pathname.startsWith("/camera/") && pathname !== "/search/" && !/[A-Z_]|\.\./.test(pathname);
      },
    }),
    // Must come after sitemap() so its files exist when this runs.
    sitemapXml(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
