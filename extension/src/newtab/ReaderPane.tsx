import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { ArrowLeft, BookOpen, ExternalLink, Loader2 } from "lucide-react";
import type { ArticleContent, DigestItem, UserPOV } from "../types/pov";
import {
  accentForPillarSlug,
  PILLAR_ACCENT_TEXT,
  PILLAR_DOT,
  PILLAR_HEX,
  resolvePillarName,
  scoreHex,
} from "../design/tokens";
import { parseArticleFromHtml } from "./utils/readability";
import { ItemFavicon, ItemHero, ItemThumbnail } from "./components/ItemMedia";

type Props = { item: DigestItem | null; pov: UserPOV };

export type ReaderPaneHandle = {
  openDetails: () => void;
  goBack: () => boolean;
  isExpanded: () => boolean;
};

type ReaderView = "preview" | "loading" | "article" | "error";

function ScoreMeter({
  label,
  value,
  max = 3,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="grid grid-cols-[5.5rem_1fr_1.25rem] items-center gap-x-2">
      <span className="text-[10px] text-stone-500 dark:text-stone-400 truncate">{label}</span>
      <div className="h-1 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: scoreHex(value, max) }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-stone-400 dark:text-stone-500 text-right">
        {value}/{max}
      </span>
    </div>
  );
}

function ScorePanel({
  item,
  layout = "wide",
}: {
  item: DigestItem;
  layout?: "wide" | "aside";
}) {
  if (!item.scoreBreakdown) return null;

  const metrics = [
    ["Pillar fit", item.scoreBreakdown.pillarFit],
    ["Audience", item.scoreBreakdown.audienceFit],
    ["Personal take", item.scoreBreakdown.founderVoiceMatch],
    ["Recency", item.scoreBreakdown.recency],
    ["Conversation", item.scoreBreakdown.conversationPotential],
  ] as const;

  if (layout === "aside") {
    return (
      <div className="w-[10.5rem] shrink-0 h-full min-h-[11rem] flex flex-col">
        <div className="flex items-baseline gap-1.5 mb-2">
          <span
            className="text-2xl font-bold tabular-nums leading-none"
            style={{ color: scoreHex(item.score) }}
          >
            {item.score}
          </span>
          <span className="text-[10px] text-stone-400 dark:text-stone-500">/ 15</span>
        </div>
        <div className="flex-1 flex flex-col justify-between gap-1.5 min-h-0">
          {metrics.map(([label, value]) => {
            const pct = Math.max(0, Math.min(100, (value / 3) * 100));
            return (
              <div key={label} className="min-h-0">
                <div className="flex items-center justify-between gap-1.5 text-[10px] leading-tight text-stone-500 dark:text-stone-400 mb-0.5">
                  <span className="truncate">{label}</span>
                  <span className="tabular-nums shrink-0 text-stone-400 dark:text-stone-500">
                    {value}/3
                  </span>
                </div>
                <div className="h-1 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: scoreHex(value, 3) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 flex items-start gap-5">
      <div className="shrink-0 pt-0.5">
        <div className="text-3xl font-bold tabular-nums leading-none text-stone-900 dark:text-stone-100">
          {item.score}
        </div>
        <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">out of 15</div>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {metrics.map(([label, value]) => (
          <ScoreMeter key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

export const ReaderPane = forwardRef<ReaderPaneHandle, Props>(function ReaderPane(
  { item, pov },
  ref,
) {
  const [view, setView] = useState<ReaderView>("preview");
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<ArticleContent | null>(null);

  useEffect(() => {
    setView("preview");
    setArticle(null);
    setError(null);
  }, [item?.id]);

  const goBack = useCallback((): boolean => {
    if (view === "preview") return false;
    setView("preview");
    setError(null);
    return true;
  }, [view]);

  const loadReader = useCallback(async (): Promise<void> => {
    if (!item) return;
    if (article) {
      setView("article");
      setError(null);
      return;
    }

    setView("loading");
    setError(null);

    try {
      const res = await chrome.runtime.sendMessage({
        type: "FETCH_ARTICLE",
        url: item.url,
      });
      if (!res?.ok || !res.html) {
        setError(res?.error ?? "Could not load article");
        setView("error");
        return;
      }
      const parsed = parseArticleFromHtml(res.html, item.url);
      if (!parsed) {
        setError("Could not extract readable content");
        setView("error");
        return;
      }
      setArticle(parsed);
      setView("article");
    } catch {
      setError("Could not load article");
      setView("error");
    }
  }, [item, article]);

  useImperativeHandle(
    ref,
    () => ({
      openDetails: () => {
        void loadReader();
      },
      goBack,
      isExpanded: () => view !== "preview",
    }),
    [loadReader, goBack, view],
  );

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 px-6">
        <p className="text-sm">Select an item to read</p>
      </div>
    );
  }

  if (view === "loading") {
    return (
      <article className="flex-1 flex flex-col items-center justify-center gap-3 px-8 py-6 bg-white dark:bg-stone-900">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" strokeWidth={1.75} />
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading article…</p>
      </article>
    );
  }

  if (view === "error" && item) {
    return (
      <article className="flex-1 overflow-y-auto px-8 py-8 bg-white dark:bg-stone-900">
        <div className="max-w-lg mx-auto flex flex-col gap-5">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors self-start"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to preview
          </button>
          <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-4 py-4">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
              Couldn&apos;t load article
            </p>
            <p className="text-sm text-rose-600 dark:text-rose-400 mt-1">{error}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadReader()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
            >
              <BookOpen className="w-4 h-4" strokeWidth={1.75} />
              Try again
            </button>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-white/60 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:bg-white dark:hover:bg-stone-700 transition-colors"
            >
              Open source
              <ExternalLink className="w-4 h-4" strokeWidth={1.75} />
            </a>
          </div>
        </div>
      </article>
    );
  }

  if (view === "article" && article) {
    return (
      <article className="flex-1 overflow-y-auto px-8 py-6 bg-white dark:bg-stone-900">
        <div className="max-w-prose mx-auto">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to preview
          </button>
          <h1 className="text-xl font-bold leading-snug text-stone-900 dark:text-stone-100">
            {article.title}
          </h1>
          {(article.byline || article.publishedTime) && (
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">
              {[article.byline, article.publishedTime].filter(Boolean).join(" · ")}
            </p>
          )}
          {article.excerpt && (
            <p className="mt-4 text-[15px] leading-relaxed text-stone-500 dark:text-stone-400">
              {article.excerpt}
            </p>
          )}
          <div
            className="reader-content mt-6"
            dangerouslySetInnerHTML={{ __html: article.contentHtml }}
          />
        </div>
      </article>
    );
  }

  const accent = accentForPillarSlug(pov, item.pillarSlug);
  const pillarName = resolvePillarName(pov, item.pillarSlug, item.pillarName);

  return (
    <article className="flex-1 overflow-y-auto min-h-0 px-8 py-8">
      <div className="max-w-lg mx-auto flex flex-col">
        {item.scoreBreakdown ? (
          <div className="mb-6 grid h-44 min-h-0 grid-cols-[minmax(0,1fr)_10.5rem] items-stretch gap-3">
            <ItemHero
              url={item.url}
              imageUrl={item.imageUrl}
              faviconUrl={item.faviconUrl}
              source={item.source}
              title={item.title}
              className="h-full min-h-0"
            />
            <ScorePanel item={item} layout="aside" />
          </div>
        ) : (
          <ItemHero
            url={item.url}
            imageUrl={item.imageUrl}
            faviconUrl={item.faviconUrl}
            source={item.source}
            title={item.title}
            className="mb-6 h-44"
          />
        )}

        <header className="space-y-3 pb-6">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${PILLAR_DOT[accent]}`} />
            <span className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
              {pillarName}
            </span>
          </div>

          <h1 className="text-xl font-bold leading-snug text-stone-900 dark:text-stone-100">
            {item.title}
          </h1>

          <p className="text-xs text-stone-500 dark:text-stone-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1.5">
              <ItemFavicon url={item.url} faviconUrl={item.faviconUrl} className="w-4 h-4 rounded-sm" />
              <span>{item.source}</span>
            </span>
            <span className="text-stone-300 dark:text-stone-600" aria-hidden>
              ·
            </span>
            <span>{item.published}</span>
            <span className="text-stone-300 dark:text-stone-600" aria-hidden>
              ·
            </span>
            <span className="capitalize">{item.audienceFit}</span>
          </p>
        </header>

        <section className="py-5 border-t border-stone-200/70 dark:border-stone-800">
          <h2
            className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${PILLAR_ACCENT_TEXT[accent]}`}
          >
            What this means for you
          </h2>
          <p className="text-[15px] leading-relaxed text-stone-800 dark:text-stone-200">
            {item.whyItMatters}
          </p>
        </section>

        {item.quotableSnippet && (
          <blockquote className="py-5 border-t border-stone-200/70 dark:border-stone-800">
            <p className="text-[15px] leading-relaxed text-stone-600 dark:text-stone-400 italic">
              &ldquo;{item.quotableSnippet}&rdquo;
            </p>
          </blockquote>
        )}

        <section className="py-5 border-t border-stone-200/70 dark:border-stone-800">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2.5">
            Summary
          </h2>
          <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            {item.summary}
          </p>
        </section>

        <footer className="pt-6 mt-1 border-t border-stone-200/70 dark:border-stone-800">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadReader()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm shadow-indigo-500/20 transition-all duration-200"
            >
              <BookOpen className="w-4 h-4" strokeWidth={1.75} />
              Read in extension
            </button>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-white/60 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:bg-white dark:hover:bg-stone-700 transition-all duration-200"
            >
              Open source
              <ExternalLink className="w-4 h-4" strokeWidth={1.75} />
            </a>
          </div>
        </footer>
      </div>
    </article>
  );
});
