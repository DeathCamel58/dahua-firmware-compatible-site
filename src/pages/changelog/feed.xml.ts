import type { APIRoute } from "astro";
import { CATEGORY_LABELS, changelogAnchor, getChangelog } from "@/lib/changelog";
import { SITE_NAME } from "@/lib/site";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 feed of changelog entries. */
export const GET: APIRoute = async ({ site }) => {
  const base = site!.href.replace(/\/$/, "");
  const entries = (await getChangelog()).slice(0, 50);
  const items = entries.map((entry) => {
    const url = `${base}/changelog/#${changelogAnchor(entry)}`;
    // Rendered Markdown, made absolute so links work in feed readers.
    const body = (entry.rendered?.html ?? "").replace(/(href|src)="\//g, `$1="${base}/`);
    return `    <item>
      <title>${escape(entry.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="false">changelog-${escape(entry.id)}</guid>
      <pubDate>${new Date(`${entry.data.date}T00:00:00Z`).toUTCString()}</pubDate>
      <category>${CATEGORY_LABELS[entry.data.category]}</category>
      <description><![CDATA[${body.replace(/]]>/g, "]]&gt;")}]]></description>
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(`${SITE_NAME}: changelog`)}</title>
    <link>${base}/changelog/</link>
    <atom:link href="${base}/changelog/feed.xml" rel="self" type="application/rss+xml" />
    <description>What's new and what changed on ${escape(SITE_NAME)}.</description>
    <language>en</language>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
