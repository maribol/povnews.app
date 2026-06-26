import { useEffect } from "react";
import { Copy, Link2, Mail, MessageCircle, Share2, X } from "lucide-react";
import type { DigestItem } from "../types/pov";
import { shareUrl, type ShareChannel } from "../utils/shareUrl";

type Props = {
  item: DigestItem | null;
  open: boolean;
  onClose: () => void;
  onCopied?: () => void;
};

type ShareAction = {
  id: ShareChannel;
  label: string;
  description: string;
  icon: typeof Share2;
  className: string;
  getUrl?: (item: DigestItem) => string;
  copy?: boolean;
};

const SHARE_ACTIONS: ShareAction[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Send in a chat",
    icon: MessageCircle,
    className:
      "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
    getUrl: (item) => {
      const url = shareUrl(item.url, "whatsapp");
      return `https://wa.me/?text=${encodeURIComponent(`${item.title}\n${url}`)}`;
    },
  },
  {
    id: "facebook",
    label: "Facebook",
    description: "Share to feed",
    icon: Share2,
    className:
      "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40",
    getUrl: (item) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl(item.url, "facebook"))}`,
  },
  {
    id: "twitter",
    label: "X / Twitter",
    description: "Post a link",
    icon: Link2,
    className:
      "bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-700",
    getUrl: (item) => {
      const url = shareUrl(item.url, "twitter");
      return `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(item.title)}`;
    },
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    description: "Share professionally",
    icon: Share2,
    className:
      "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40",
    getUrl: (item) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl(item.url, "linkedin"))}`,
  },
  {
    id: "email",
    label: "Email",
    description: "Open in mail app",
    icon: Mail,
    className:
      "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40",
    getUrl: (item) => {
      const url = shareUrl(item.url, "email");
      return `mailto:?subject=${encodeURIComponent(item.title)}&body=${encodeURIComponent(`${item.summary}\n\n${url}`)}`;
    },
  },
  {
    id: "copy",
    label: "Copy link",
    description: "Copy URL to clipboard",
    icon: Copy,
    className:
      "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40",
    copy: true,
  },
];

export function ShareModal({ item, open, onClose, onCopied }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !item) return null;

  const copyUrl = shareUrl(item.url, "copy");

  async function handleAction(action: ShareAction): Promise<void> {
    if (action.copy) {
      try {
        await navigator.clipboard.writeText(copyUrl);
        onCopied?.();
        onClose();
      } catch {
        /* clipboard blocked */
      }
      return;
    }
    if (action.getUrl) {
      window.open(action.getUrl(item!), "_blank", "noopener,noreferrer");
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-100 dark:border-stone-800">
          <div className="min-w-0">
            <h2
              id="share-modal-title"
              className="text-sm font-semibold text-stone-900 dark:text-stone-100"
            >
              Share article
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">
              {item.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 grid grid-cols-2 gap-2">
          {SHARE_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => void handleAction(action)}
                className={`flex items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${action.className}`}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{action.label}</span>
                  <span className="block text-[11px] opacity-80 mt-0.5">{action.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-5 pb-4">
          <p className="text-[11px] text-stone-400 dark:text-stone-500 truncate font-mono">
            {copyUrl}
          </p>
        </div>
      </div>
    </div>
  );
}
