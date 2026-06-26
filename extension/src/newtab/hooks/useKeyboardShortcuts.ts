import { useEffect } from "react";

type Handlers = {
  onMoveDown: () => void;
  onMoveUp: () => void;
  onOpenDetails: () => void;
  onGoBack: () => void;
  onShare: () => void;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onDismiss: () => void;
  onArchive: () => void;
  onMarkRead: () => void;
  onOpen: () => void;
  enabled?: boolean;
};

export function useKeyboardShortcuts({
  onMoveDown,
  onMoveUp,
  onOpenDetails,
  onGoBack,
  onShare,
  onThumbsUp,
  onThumbsDown,
  onDismiss,
  onArchive,
  onMarkRead,
  onOpen,
  enabled = true,
}: Handlers): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          onMoveDown();
          break;
        case "ArrowUp":
          e.preventDefault();
          onMoveUp();
          break;
        case "ArrowLeft":
          e.preventDefault();
          onGoBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          onOpenDetails();
          break;
        case "s":
        case "S":
          if (!e.shiftKey) break;
          e.preventDefault();
          onShare();
          break;
        case "t": // good / like
          e.preventDefault();
          onThumbsUp();
          break;
        case "x": // bad / dislike
          e.preventDefault();
          onThumbsDown();
          break;
        case "d": // dismiss
          e.preventDefault();
          onDismiss();
          break;
        case "a": // archive
          e.preventDefault();
          onArchive();
          break;
        case "r": // mark read / seen
          e.preventDefault();
          onMarkRead();
          break;
        case "o": // open original
          e.preventDefault();
          onOpen();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    onMoveDown,
    onMoveUp,
    onOpenDetails,
    onGoBack,
    onShare,
    onThumbsUp,
    onThumbsDown,
    onDismiss,
    onArchive,
    onMarkRead,
    onOpen,
    enabled,
  ]);
}
