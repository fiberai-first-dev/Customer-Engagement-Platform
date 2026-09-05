import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Clock, ExternalLink, Send } from "lucide-react";
import type { ChannelType, Contact } from "../../api";
import { formatDistanceToNow, intervalToDuration } from "date-fns";
import { Button } from "../ui/button";
import { instagramThreadOpenUrl } from "./utils";

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
        className={`flex items-center gap-2 border-b px-4 py-2 text-xs font-medium ${
          expiringSoon
            ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {expiringSoon ? (
          <AlertCircle className="h-4 w-4 shrink-0" />
        ) : (
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        )}
        <span>
          {channel === "whatsapp" ? "WhatsApp" : channel === "facebook" ? "Facebook" : "Instagram"} window active · expires in {remaining}
        </span>
      </div>
    );
  }

  if (state === "EXTENDED" && !requiresExternalInbox) {
    return (
      <div className="flex items-center gap-2 border-b border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-400">
        <Clock className="h-4 w-4 shrink-0" />
        <span>
          Extended 7-day Instagram window · expires{" "}
          {expiresAt ? formatDistanceToNow(new Date(expiresAt), { addSuffix: true }) : "soon"}
        </span>
      </div>
    );
  }

  return null;
}

interface InstagramExternalInboxPanelProps {
  contact: Contact | null;
  state: "EXPIRED" | "EXTENDED";
}

export function InstagramExternalInboxPanel({ contact, state }: InstagramExternalInboxPanelProps) {
  const link = instagramThreadOpenUrl(contact);
  const isExpired = state === "EXPIRED";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm mx-4 mb-4 flex flex-col sm:flex-row sm:items-center">
      <div className="flex-1 bg-muted/30 px-4 py-3 sm:px-5 sm:py-4">
        <p className="text-sm font-semibold text-foreground">Instagram window closed</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
          {isExpired
            ? "The 7-day messaging window has expired. Please use the Instagram app to reply."
            : "The 24-hour messaging window has expired. Please use the Instagram app to reply."}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 border-t border-border bg-background px-4 py-3 sm:border-l sm:border-t-0 sm:px-5 sm:py-4 shrink-0">
        {link.hasDirectThread && link.handleLabel ? (
          <Button asChild size="sm" className="w-full sm:w-auto gap-2 shadow-sm">
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              <Send className="h-3.5 w-3.5" />
              Message {link.handleLabel}
            </a>
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-[10px] text-center text-muted-foreground sm:max-w-[150px] leading-tight">
              We couldn't resolve this customer's Instagram handle.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto gap-1.5">
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                Open Inbox
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface WhatsAppTemplateClosedPanelProps {
  templatesEnabled: boolean;
  children: ReactNode;
}

export function WhatsAppTemplateClosedPanel({
  templatesEnabled,
  children,
}: WhatsAppTemplateClosedPanelProps) {
  if (!templatesEnabled) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm mx-4 mb-4">
        <div className="bg-muted/30 px-5 py-4">
          <p className="text-sm font-semibold text-foreground">WhatsApp window closed</p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            The 24-hour service window has expired. You must wait for the customer to send a new message before you can reply.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm mx-4 mb-4">
      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <p className="text-sm font-semibold text-foreground">WhatsApp window closed</p>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          The 24-hour service window has expired. Send an approved template to resume the conversation.
        </p>
      </div>

      <div className="px-5 py-6 bg-background">
        <div className="flex justify-center">{children}</div>
      </div>
    </div>
  );
}

export function FacebookExternalInboxPanel(_props?: { contact?: Contact | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm mx-4 mb-4 flex flex-col sm:flex-row sm:items-center">
      <div className="flex-1 bg-muted/30 px-4 py-3 sm:px-5 sm:py-4">
        <p className="text-sm font-semibold text-foreground">Facebook window closed</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
          The 24-hour messaging window has expired. You must wait for the customer to send a message or reply via Meta Business Suite.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 border-t border-border bg-background px-4 py-3 sm:border-l sm:border-t-0 sm:px-5 sm:py-4 shrink-0">
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto gap-1.5">
          <a href="https://business.facebook.com/latest/inbox" target="_blank" rel="noopener noreferrer">
            Open Meta Inbox
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </a>
        </Button>
      </div>
    </div>
  );
}
