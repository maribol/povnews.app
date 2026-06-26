export type ShareChannel =
  | "whatsapp"
  | "facebook"
  | "twitter"
  | "linkedin"
  | "email"
  | "copy";

export function shareUrl(url: string, channel: ShareChannel): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("utm_source", "pov-news");
    parsed.searchParams.set("utm_medium", "share");
    parsed.searchParams.set("utm_campaign", channel);
    return parsed.toString();
  } catch {
    return url;
  }
}
