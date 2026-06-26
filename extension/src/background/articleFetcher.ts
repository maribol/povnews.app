export async function fetchArticleHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; POVNews/1.0; +https://pov-news.local)",
    },
    credentials: "omit",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status})`);
  }
  return res.text();
}
