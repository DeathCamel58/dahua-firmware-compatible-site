import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Changelog entries: one Markdown file per entry in src/content/changelog/. See README for the format.
 * Individual new firmware files don't need entries; /new/ lists those automatically.
 */
const changelog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/changelog" }),
  schema: z.object({
    title: z.string().min(1),
    /** YYYY-MM-DD. YAML turns an unquoted date into a Date, so accept either and normalise to text. */
    date: z
      .union([z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")])
      .transform((d) => (typeof d === "string" ? d : d.toISOString().slice(0, 10))),
    /** site: features and design; data: new sources, metadata or bulk firmware additions; fix: corrections. */
    category: z.enum(["site", "data", "fix"]).default("site"),
  }),
});

export const collections = { changelog };
