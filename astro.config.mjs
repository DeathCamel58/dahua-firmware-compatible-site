// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Post-processes @astrojs/sitemap's output:
 *  - adds <lastmod> from each page's og:updated_time (when its content last changed);
 *  - drops every URL whose page is marked noindex (redirect stubs for duplicate files and old
 *    URLs, the search page, 404), so the sitemap only lists real, indexable pages;
 *  - also publishes the conventional /sitemap.xml: the full URL list while it fits in one file
 *    (50,000 URLs), otherwise a copy of the index.
 * @returns {import("astro").AstroIntegration}
 */
function sitemapXml() {
  return {
    name: "sitemap-xml",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const site = "https://dahua.randomcpu.com";
        const chunks = (await readdir(out)).filter((f) => /^sitemap-\d+\.xml$/.test(f));
        let dropped = 0;
        let dated = 0;
        for (const chunk of chunks) {
          const xml = await readFile(`${out}/${chunk}`, "utf8");
          const kept = [];
          for (const entry of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
            const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "";
            const pathname = decodeURI(loc.replace(site, "")) || "/";
            const html = await readFile(`${out}${pathname}index.html`, "utf8").catch(() => "");
            if (/<meta name="robots" content="noindex/.test(html)) {
              dropped++;
              continue;
            }
            // Pages declare when their content last changed; pass that on to crawlers.
            const lastmod = html.match(/<meta property="og:updated_time" content="(\d{4}-\d{2}-\d{2})"/)?.[1];
            if (lastmod) dated++;
            kept.push(lastmod && !entry.includes("<lastmod>") ? entry.replace("</loc>", `</loc><lastmod>${lastmod}</lastmod>`) : entry);
          }
          const head = xml.slice(0, xml.indexOf("<url>") === -1 ? xml.indexOf("</urlset>") : xml.indexOf("<url>"));
          await writeFile(`${out}/${chunk}`, `${head}${kept.join("")}</urlset>`);
        }
        const source = chunks.length === 1 ? chunks[0] : "sitemap-index.xml";
        await copyFile(`${out}/${source}`, `${out}/sitemap.xml`);
        logger.info(`sitemap.xml written from ${source} (${dropped} noindex pages left out, ${dated} with lastmod)`);
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
      // Cheap first pass; sitemapXml() below also drops anything marked noindex.
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
