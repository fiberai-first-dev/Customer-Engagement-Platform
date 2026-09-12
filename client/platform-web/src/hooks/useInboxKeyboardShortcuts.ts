import { useEffect } from "react";

export interface InboxKeyboardShortcutsConfig {
  /** `j` — move to the next conversation in the list */
  onNextConversation: () => void;
  /** `k` — move to the previous conversation in the list */
  onPrevConversation: () => void;
  /** `r` — focus the reply composer */
  onFocusReply: () => void;
  /** `e` — resolve the current conversation */
  onResolve: () => void;
  /** `a` — assign the current conversation to self */
  onAssignToSelf: () => void;
  /** `?` (Shift+/) — toggle the keyboard shortcuts overlay */
  onToggleShortcuts: () => void;
  /** When false the listener is not registered at all */
  enabled?: boolean;
}

/**
 * Registers global keyboard shortcuts for the Inbox.
 * The listener is skipped while the user is typing in an input,
 * textarea, or contenteditable element.
 */
export function useInboxKeyboardShortcuts({
  onNextConversation,
  onPrevConversation,
  onFocusReply,
  onResolve,
  onAssignToSelf,
  onToggleShortcuts,
  enabled = true,
}: InboxKeyboardShortcutsConfig): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when focus is inside an editable element
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case "j":
          e.preventDefault();
          onNextConversation();
          break;
        case "k":
          e.preventDefault();
          onPrevConversation();
          break;
        case "r":
          e.preventDefault();
          onFocusReply();
          break;
        case "e":
          e.preventDefault();
          onResolve();
          break;
        case "a":
          e.preventDefault();
          onAssignToSelf();
          break;
        case "?":
          e.preventDefault();
          onToggleShortcuts();
          break;
        default:
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    enabled,
    onNextConversation,
    onPrevConversation,
    onFocusReply,
    onResolve,
    onAssignToSelf,
    onToggleShortcuts,
  ]);
}
