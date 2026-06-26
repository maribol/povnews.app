export type PageMeta = {
  imageUrl?: string;
  faviconUrl?: string;
};

export function resolvePageUrl(href: string, base: string): string | undefined {
  try {
    return new URL(href.trim(), base).href;
  } catch {
    return undefined;
  }
}

export function defaultFaviconUrl(pageUrl: string): string | undefined {
  try {
    return `${new URL(pageUrl).origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

function extractHead(html: string): string {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return match?.[1] ?? html.slice(0, 80_000);
}

function metaContent(head: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]+content\\s*=\\s*["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+(?:property|name)\\s*=\\s*["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = head.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function extractFavicon(head: string, pageUrl: string): string | undefined {
  const icons: { href: string; size: number }[] = [];
  for (const tag of head.matchAll(/<link[^>]+>/gi)) {
    const link = tag[0];
    if (!/\brel\s*=\s*["'][^"']*icon/i.test(link)) continue;
    const href = link.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const sizeMatch = link.match(/\bsizes\s*=\s*["'](\d+)/i)?.[1];
    icons.push({
      href,
      size: sizeMatch ? Number.parseInt(sizeMatch, 10) : 16,
    });
  }
  icons.sort((a, b) => b.size - a.size);
  if (icons[0]) {
    return resolvePageUrl(icons[0].href, pageUrl);
  }
  return defaultFaviconUrl(pageUrl);
}

export function extractPageMeta(html: string, pageUrl: string): PageMeta {
  const head = extractHead(html);
  const rawImage =
    metaContent(head, "og:image") ??
    metaContent(head, "og:image:url") ??
    metaContent(head, "twitter:image") ??
    metaContent(head, "twitter:image:src");

  const imageUrl = rawImage ? resolvePageUrl(rawImage, pageUrl) : undefined;
  const faviconUrl = extractFavicon(head, pageUrl);

  return { imageUrl, faviconUrl };
}
