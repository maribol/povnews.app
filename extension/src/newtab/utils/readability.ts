import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import type { ArticleContent } from "../../types/pov";

const JUNK_HEADING =
  /^(general summary|key takeaways|article summary|ai summary|quick summary|summary|at a glance|tl;dr)$/i;

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "em",
    "strong",
    "b",
    "i",
    "a",
    "img",
    "figure",
    "figcaption",
    "br",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "sup",
    "sub",
    "mark",
    "dl",
    "dt",
    "dd",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "colspan", "rowspan", "start"],
};

function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function cleanArticleHtml(html: string, title: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  const titleNorm = normalizeLabel(title);

  body.querySelectorAll("h1").forEach((h1) => {
    if (normalizeLabel(h1.textContent ?? "") === titleNorm) {
      h1.remove();
    }
  });

  body.querySelectorAll("h2, h3, h4, h5, strong").forEach((heading) => {
    const label = normalizeLabel(heading.textContent ?? "");
    if (!JUNK_HEADING.test(label)) return;

    const remove: Element[] = [heading];
    let next = heading.nextElementSibling;
    while (
      next &&
      ["P", "UL", "OL", "DIV", "SECTION"].includes(next.tagName) &&
      (next.textContent?.length ?? 0) < 700
    ) {
      remove.push(next);
      next = next.nextElementSibling;
      if (remove.length >= 4) break;
    }
    remove.forEach((node) => node.remove());
  });

  body.querySelectorAll("p, div, section, aside, figure, li").forEach((el) => {
    const text = (el.textContent ?? "").trim();
    const hasMedia = el.querySelector("img, video, picture, svg, iframe, table");
    if (!text && !hasMedia) el.remove();
  });

  body.querySelectorAll("br").forEach((br) => {
    const parent = br.parentElement;
    if (!parent) return;
    const siblings = [...parent.childNodes].filter(
      (n) => n.nodeType !== Node.TEXT_NODE || (n.textContent ?? "").trim(),
    );
    if (siblings.length <= 1) parent.remove();
  });

  return body.innerHTML.trim();
}

function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block)}</p>`)
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizePlainText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function parseArticleFromHtml(
  html: string,
  url: string,
): ArticleContent | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, iframe, svg").forEach((el) => el.remove());

  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);

  const reader = new Readability(doc, {
    charThreshold: 100,
    keepClasses: false,
  });
  const article = reader.parse();
  if (!article) return null;

  const title = (article.title || url).trim();
  let contentHtml = "";

  if (article.content) {
    const cleaned = cleanArticleHtml(article.content, title);
    contentHtml = DOMPurify.sanitize(cleaned, PURIFY_CONFIG) as string;
  }

  if (!contentHtml && article.textContent) {
    contentHtml = textToHtmlParagraphs(normalizePlainText(article.textContent));
  }

  if (!contentHtml) return null;

  return {
    title,
    contentHtml,
    excerpt: article.excerpt?.trim() || undefined,
    byline: article.byline?.trim() || undefined,
    publishedTime: article.publishedTime ?? undefined,
  };
}
