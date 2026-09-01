import { useEffect, useState } from "react";
import { AlertCircle, Clock } from "lucide-react";
import type { ChannelType } from "../../api";
import { formatDistanceToNow, intervalToDuration } from "date-fns";

type WindowState = "ACTIVE" | "EXTENDED" | "EXPIRED" | "TEMPLATE_REQUIRED";

interface Props {
  channel: ChannelType;
  state: WindowState;
  expiresAt: string | null;
  canSendNormalMessage: boolean;
  requiresTemplate: boolean;
  requiresHumanAgentTag: boolean;
  requiresExternalInbox?: boolean;
}

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const duration = intervalToDuration({ start: 0, end: ms });
  const hours = duration.hours ?? 0;
  const minutes = duration.minutes ?? 0;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function ConversationWindowBanner({
  channel,
  state,
  expiresAt,
  requiresExternalInbox,
}: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (channel === "email" || !expiresAt) return;
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [channel, expiresAt]);

  if (channel === "email") return null;

  if (state === "ACTIVE" && expiresAt) {
    const remaining = formatRemaining(expiresAt);
    const expiringSoon =
      new Date(expiresAt).getTime() - Date.now() <= 60 * 60 * 1000;

    return (
      <div
        className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-xs font-medium border-b ${
          expiringSoon
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
        }`}
      >
        {expiringSoon ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        )}
        <span>
          {channel === "whatsapp" ? "WhatsApp" : "Instagram"} window active · expires in {remaining}
        </span>
      </div>
    );
  }

  if (state === "EXTENDED" && !requiresExternalInbox) {
    return (
      <div className="flex items-center gap-2 rounded-t-lg bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-400 border-b border-blue-500/20">
        <Clock className="h-4 w-4" />
        <span>
          Extended 7-day Instagram window · expires{" "}
          {expiresAt ? formatDistanceToNow(new Date(expiresAt), { addSuffix: true }) : "soon"}
        </span>
      </div>
    );
  }

  if (state === "EXTENDED" && requiresExternalInbox) {
    return (
      <div className="flex items-center gap-2 rounded-t-lg bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-400 border-b border-amber-500/20">
        <AlertCircle className="h-4 w-4" />
        <span>
          The 24-hour Instagram window has closed. Use the Instagram app to reply until the customer messages again.
        </span>
      </div>
    );
  }

  if (state === "EXPIRED" || state === "TEMPLATE_REQUIRED") {
    return (
      <div className="flex items-center gap-2 rounded-t-lg bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-400 border-b border-amber-500/20">
        <AlertCircle className="h-4 w-4" />
        <span>
          {channel === "whatsapp"
            ? "The 24-hour messaging window has closed. Send an approved WhatsApp template to contact this customer."
            : "The 7-day messaging window has closed. You cannot message this customer until they reply."}
        </span>
      </div>
    );
  }

  return null;
}

function InstagramExternalInboxPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-6 flex flex-col items-center justify-center text-center space-y-3">
      <p className="text-sm text-muted-foreground">{message}</p>
      <a
        href="https://www.instagram.com/direct/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2"
      >
        Open Instagram Inbox
      </a>
    </div>
  );
}

export { InstagramExternalInboxPanel };
