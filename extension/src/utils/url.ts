/** Normalize a URL for dedupe: drop hash, tracking params, and trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const params = u.searchParams;
    for (const key of [...params.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref|ref_src|igshid)/i.test(key)) {
        params.delete(key);
      }
    }
    u.search = params.toString();
    let href = u.href;
    if (href.endsWith("/") && u.pathname !== "/") href = href.slice(0, -1);
    return href.replace(/\/$/, (m) => (u.pathname === "/" ? m : ""));
  } catch {
    return url.trim().toLowerCase();
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
