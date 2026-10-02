// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

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
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
