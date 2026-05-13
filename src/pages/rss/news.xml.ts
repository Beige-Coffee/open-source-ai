import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

/**
 * Full firehose RSS feed.
 *
 * Once the daily routine starts (Week 2), each news issue is one MDX
 * file in `src/content/news/YYYY-MM-DD.mdx`. This endpoint emits one
 * RSS item per issue.
 */
export async function GET(context: APIContext) {
  const news = await getCollection("news");
  news.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  return rss({
    title: "The Open-Source AI Stack: Daily News",
    description:
      "Daily roundup of news routed to the layers of the open-source AI stack. Updated every day at 08:00 Pacific by a scheduled agent.",
    site: context.site ?? "https://open-source-ai.tech",
    items: news.map((issue) => ({
      title: `Daily roundup — ${issue.data.date.toISOString().slice(0, 10)}`,
      pubDate: issue.data.date,
      description: issue.data.editorial_letter,
      link: `/news/${issue.data.date.toISOString().slice(0, 10)}/`,
    })),
    customData: `<language>en-us</language>`,
  });
}
