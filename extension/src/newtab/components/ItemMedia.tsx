import { useState } from "react";
import { Globe } from "lucide-react";
import { defaultFaviconUrl } from "../../background/pageMeta";

function fallbackFaviconUrl(pageUrl: string): string | undefined {
  try {
    const host = new URL(pageUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch {
    return undefined;
  }
}

export function faviconSrc(item: { url: string; faviconUrl?: string }): string | undefined {
  return item.faviconUrl ?? defaultFaviconUrl(item.url) ?? fallbackFaviconUrl(item.url);
}

type FaviconProps = {
  url: string;
  faviconUrl?: string;
  className?: string;
};

export function ItemFavicon({ url, faviconUrl, className = "w-4 h-4 rounded-sm" }: FaviconProps) {
  const [failed, setFailed] = useState(false);
  const primary = faviconSrc({ url, faviconUrl });
  const fallback = fallbackFaviconUrl(url);
  const src = failed ? fallback : primary;

  if (!src) {
    return <Globe className={`${className} text-stone-400 shrink-0`} strokeWidth={1.75} />;
  }

  return (
    <img
      src={src}
      alt=""
      className={`${className} shrink-0 object-cover bg-stone-100 dark:bg-stone-800`}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (!failed && fallback && src !== fallback) setFailed(true);
      }}
    />
  );
}

type ImageProps = {
  url: string;
  imageUrl?: string;
  alt: string;
  className?: string;
};

export function ItemImage({ url, imageUrl, alt, className }: ImageProps) {
  const [hidden, setHidden] = useState(false);
  if (!imageUrl || hidden) return null;

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setHidden(true)}
    />
  );
}

type HeroProps = {
  url: string;
  imageUrl?: string;
  faviconUrl?: string;
  source: string;
  title: string;
  className?: string;
};

/** Fixed-size hero with crop + fallback when og:image is missing or fails to load. */
export function ItemHero({
  url,
  imageUrl,
  faviconUrl,
  source,
  title,
  className = "h-44",
}: HeroProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl && !failed);

  return (
    <div
      className={`relative min-h-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800 ${className}`}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-stone-100 via-stone-50 to-stone-200/90 dark:from-stone-800 dark:via-stone-900 dark:to-stone-950 px-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/80 dark:bg-stone-800/80 shadow-sm ring-1 ring-stone-200/80 dark:ring-stone-700/80">
            <ItemFavicon url={url} faviconUrl={faviconUrl} className="h-7 w-7 rounded-md" />
          </div>
          <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 line-clamp-2 max-w-[14rem]">
            {source}
          </span>
        </div>
      )}
    </div>
  );
}

type ThumbnailProps = {
  url: string;
  imageUrl?: string;
  faviconUrl?: string;
  alt?: string;
  className?: string;
};

/** Small list thumbnail — fixed box, never expands layout. */
export function ItemThumbnail({
  url,
  imageUrl,
  faviconUrl,
  alt = "",
  className = "w-12 h-12",
}: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl && !failed);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800 ${className}`}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200/70 dark:from-stone-800 dark:to-stone-900">
          <ItemFavicon url={url} faviconUrl={faviconUrl} className="h-5 w-5 rounded-sm opacity-80" />
        </div>
      )}
    </div>
  );
}
