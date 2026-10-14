// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Child sitemaps, by first path segment; pages outside these sections go in the last one. */
const SITEMAP_SECTIONS = ["device", "model", "firmware", "vendor", "soc"];

/**
 * Post-processes @astrojs/sitemap's output:
 *  - adds <lastmod> from each page's og:updated_time (when its content last changed);
 *  - drops redirect stubs (old URLs and duplicate files, recognised by their meta refresh) and pages
 *    marked noindex (search, 404), so the sitemaps only list real, indexable pages;
 *  - splits the URLs into one sitemap per section (/sitemap-device.xml etc., so Search Console
 *    reports indexing per section) and makes /sitemap.xml the index pointing at them.
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
        /** @type {Map<string, { entries: string[], lastmod: string }>} */
        const sections = new Map(SITEMAP_SECTIONS.map((name) => [name, { entries: [], lastmod: "" }]));
        let head = "";
        let stubs = 0;
        let hidden = 0;
        let dated = 0;
        for (const chunk of chunks) {
          const xml = await readFile(`${out}/${chunk}`, "utf8");
          head ||= xml.slice(0, xml.indexOf("<url>") === -1 ? xml.indexOf("</urlset>") : xml.indexOf("<url>"));
          for (const entry of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
            const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "";
            const pathname = decodeURI(loc.replace(site, "")) || "/";
            const html = await readFile(`${out}${pathname}index.html`, "utf8").catch(() => "");
            if (/<meta http-equiv="refresh"/.test(html)) {
              stubs++;
              continue;
            }
            if (/<meta name="robots" content="noindex/.test(html)) {
              hidden++;
              continue;
            }
            // Pages declare when their content last changed; pass that on to crawlers.
            const lastmod = html.match(/<meta property="og:updated_time" content="(\d{4}-\d{2}-\d{2})"/)?.[1];
            if (lastmod) dated++;
            const segment = pathname.split("/")[1];
            const section = /** @type {{ entries: string[], lastmod: string }} */ (sections.get(segment) ?? sections.get(SITEMAP_SECTIONS[SITEMAP_SECTIONS.length - 1]));
            section.entries.push(lastmod && !entry.includes("<lastmod>") ? entry.replace("</loc>", `</loc><lastmod>${lastmod}</lastmod>`) : entry);
            if (lastmod && lastmod > section.lastmod) section.lastmod = lastmod;
          }
          await unlink(`${out}/${chunk}`);
        }
        const index = [];
        for (const [name, { entries, lastmod }] of sections) {
          if (!entries.length) continue;
          await writeFile(`${out}/sitemap-${name}.xml`, `${head}${entries.join("")}</urlset>`);
          index.push(`<sitemap><loc>${site}/sitemap-${name}.xml</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</sitemap>`);
          logger.info(`sitemap-${name}.xml: ${entries.length} URLs`);
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${index.join("")}</sitemapindex>`;
        // sitemap.xml is the one robots.txt and Search Console point at; keep the plugin's name working too.
        await writeFile(`${out}/sitemap.xml`, xml);
        await writeFile(`${out}/sitemap-index.xml`, xml);
        logger.info(`sitemap.xml indexes ${index.length} sitemaps (${stubs} redirect stubs and ${hidden} noindex pages left out, ${dated} with lastmod)`);
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
      // Cheap first pass; sitemapXml() below also drops redirect stubs and anything marked noindex.
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
