import type { APIRoute } from "astro";
import { analysisLabel, getData, newlyAdded, paths } from "@/lib/data";
import { SITE_NAME } from "@/lib/site";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 feed of newly published firmware (by the day it first appeared on a vendor page). */
export const GET: APIRoute = async ({ site }) => {
  const data = await getData();
  const base = site!.href.replace(/\/$/, "");
  const items = newlyAdded(data)
    .slice(0, 50)
    .map((fw) => {
      const url = `${base}${paths.firmware(fw)}`;
      const summary = [fw.vendors.join(", "), fw.version, analysisLabel(fw)].filter(Boolean).join(" · ");
      return `    <item>
      <title>${escape(fw.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(`${fw.firstSeen}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escape(`${fw.displayName}: ${summary}`)}</description>
${fw.vendors.map((v) => `      <category>${escape(v)}</category>`).join("\n")}
    </item>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(`${SITE_NAME}: newly added firmware`)}</title>
    <link>${base}/new/</link>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Firmware newly published by Dahua and its OEM vendors.</description>
    <language>en</language>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
