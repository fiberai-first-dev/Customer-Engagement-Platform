import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Clock, ExternalLink, MessageSquareText, Send } from "lucide-react";
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
          {channel === "whatsapp" ? "WhatsApp" : "Instagram"} window active · expires in {remaining}
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
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white shadow-sm">
          <Send className="h-4 w-4" />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-foreground">
            {isExpired ? "Messaging window closed" : "24-hour window closed"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {isExpired
              ? "This customer has not replied in over 7 days. CEP cannot send messages until they message you again."
              : "CEP cannot send Instagram replies after 24 hours without Human Agent approval. Continue the conversation in Instagram."}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 px-4 py-5">
        {link.hasDirectThread && link.handleLabel ? (
          <>
            <p className="text-center text-sm text-muted-foreground">
              Open a direct message with{" "}
              <span className="font-medium text-foreground">{link.handleLabel}</span>
            </p>
            <Button asChild size="lg" className="gap-2 px-6 shadow-sm">
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                <Send className="h-4 w-4" />
                Message {link.handleLabel}
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-muted-foreground">
              We could not resolve this customer&apos;s Instagram username. Open your inbox and search for them manually.
            </p>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                Open Instagram Inbox
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </>
        )}
        <p className="text-[11px] text-muted-foreground/80">
          Opens Instagram in a new tab · log in with your business account if prompted
        </p>
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
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm">
          <MessageSquareText className="h-4 w-4" />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-foreground">WhatsApp window closed</p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            The customer has not messaged in the last 24 hours. Send an approved template to start the conversation again.
          </p>
        </div>
      </div>

      <div className="px-4 py-5">
        {templatesEnabled ? (
          children
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">Templates are disabled</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enable WhatsApp Templates in Settings or the admin panel to contact this customer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
