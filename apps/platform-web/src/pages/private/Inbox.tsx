import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { Loader2, Mail, MessageCircle, Search } from "lucide-react";
import {
  useAccounts,
  useContacts,
  useConversations,
  useDeleteMessages,
  useEnabledChannelTypes,
  useMessages,
  useSendMessage,
  useSuppressConversation,
  useUpdateConversation,
  type ChannelType,
  type Conversation,
} from "../../api";
import { useAppStore } from "../../store";
import {
  CHANNELS,
  ConversationEmptyState,
  ConversationList,
  ConversationThread,
  CustomerDetails,
  LivePulse,
  channelLabel,
  cn,
  contactDisplayName,
  contactGlobalIsActive,
  identitiesFor,
  isActiveStatus,
  pickListConversation,
  pickPrimaryConversation,
} from "../../components/inbox";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";

type ChannelFilter = "all" | ChannelType;
type PendingDelete =
  | { kind: "clear"; conversationId: string; channel: ChannelType }
  | {
      kind: "messages";
      conversationId: string;
      channel: ChannelType;
      messageIds: string[];
      resolve: (ok: boolean) => void;
    };

/** Compact Instagram glyph — lucide has no brand mark that reads clearly at 12px. */
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const CHANNEL_FILTER_ICONS: Record<ChannelType, ComponentType<{ className?: string }>> = {
  whatsapp: MessageCircle,
  instagram: InstagramGlyph,
  email: Mail,
};

export function InboxPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [activeTab, setActiveTab] = useState<ChannelType>("whatsapp");
  const [customerContextOpen, setCustomerContextOpen] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const focusedContactRef = useRef<string | null>(null);

  const {
    data: conversations,
    isPending: conversationsPending,
    isFetching: conversationsFetching,
  } = useConversations("all");
  const { selectedContactId, setSelectedContactId } = useAppStore();
  const { data: accounts } = useAccounts();
  const { data: directoryContacts } = useContacts(accounts?.[0]?.id);

  const sendMessage = useSendMessage();
  const updateStatus = useUpdateConversation();
  const suppressConversation = useSuppressConversation();
  const deleteMessages = useDeleteMessages();
  const { enabledChannels, channelsReady } = useEnabledChannelTypes();
  const enabledSet = useMemo(() => new Set(enabledChannels), [enabledChannels]);

  const showInitialListLoader = conversationsPending && conversations === undefined;

  /** Channel threads grouped by contact — status lives per channel conversation. */
  const conversationsByContact = useMemo(() => {
    const map: Record<string, Conversation[]> = {};
    for (const conversation of conversations ?? []) {
      if (channelsReady && !enabledSet.has(conversation.channelType)) continue;
      (map[conversation.contactId] ??= []).push(conversation);
    }
    return map;
  }, [conversations, enabledSet, channelsReady]);

  const listConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const items: Conversation[] = [];

    for (const channelConvs of Object.values(conversationsByContact)) {
      const listRow = pickListConversation(channelConvs, channelFilter);
      if (!listRow) continue;

      if (statusFilter === "active") {
        if (channelFilter === "all") {
          if (!contactGlobalIsActive(listRow.contact, channelConvs)) continue;
        } else if (!isActiveStatus(listRow.status)) {
          continue;
        }
      }

      if (!query) {
        items.push(listRow);
        continue;
      }

      const matches = channelConvs.some((conversation) => {
        const name = conversation.contact.name?.toLowerCase() ?? "";
        const email = conversation.contact.email?.toLowerCase() ?? "";
        const whatsappParts = [
          conversation.contact.whatsappId,
          conversation.contact.identifiers?.whatsapp,
          ...(conversation.contact.whatsappIds ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const preview = conversation.messages?.[0]?.content?.toLowerCase() ?? "";
        const digitsQuery = query.replace(/[^\d]/g, "");
        const digitsWhatsapp = whatsappParts.replace(/[^\d]/g, "");
        return (
          name.includes(query) ||
          email.includes(query) ||
          whatsappParts.includes(query) ||
          preview.includes(query) ||
          (digitsQuery.length >= 4 && digitsWhatsapp.includes(digitsQuery))
        );
      });
      if (matches) items.push(listRow);
    }

    return items.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversationsByContact, statusFilter, channelFilter, searchQuery]);

  const channelFilterOptions = useMemo(() => {
    const enabled =
      channelsReady && enabledChannels.length
        ? CHANNELS.filter((c) => enabledChannels.includes(c.id))
        : CHANNELS;
    return [{ id: "all" as const, label: "All" }, ...enabled];
  }, [channelsReady, enabledChannels]);

  const listEmptyHint =
    channelFilter === "all"
      ? statusFilter === "active"
        ? "Unresolved contacts appear here until every thread is resolved."
        : "No contacts match this filter."
      : statusFilter === "active"
        ? `No unresolved ${channelLabel(channelFilter)} conversations.`
        : `No ${channelLabel(channelFilter)} conversations.`;

  const contactConversations = useMemo(() => {
    const map: Partial<Record<ChannelType, Conversation>> = {};
    if (!selectedContactId) return map;
    for (const conversation of conversations ?? []) {
      if (conversation.contactId !== selectedContactId) continue;
      if (channelsReady && !enabledSet.has(conversation.channelType)) continue;
      if (!map[conversation.channelType]) {
        map[conversation.channelType] = conversation;
      }
    }
    return map;
  }, [conversations, selectedContactId, enabledSet, channelsReady]);

  const selectedListConversation =
    listConversations.find((c) => c.contactId === selectedContactId) ??
    (selectedContactId && conversationsByContact[selectedContactId]
      ? pickPrimaryConversation(conversationsByContact[selectedContactId]!)
      : null);

  const directoryContact = useMemo(
    () => directoryContacts?.find((c) => c.id === selectedContactId) ?? null,
    [directoryContacts, selectedContactId],
  );

  const selectedContact =
    contactConversations[activeTab]?.contact ??
    selectedListConversation?.contact ??
    Object.values(contactConversations)[0]?.contact ??
    directoryContact ??
    null;

  /** Email / WhatsApp can start outbound when an identity exists (Shopify-linked email, etc.). Instagram cannot. */
  const selectedConversation = useMemo(() => {
    if (!selectedContactId || !selectedContact) return null;
    const existing = contactConversations[activeTab];
    if (existing) return existing;
    if (activeTab === "instagram") return null;
    if (channelsReady && !enabledSet.has(activeTab)) return null;
    const ids = identitiesFor(selectedContact, activeTab);
    if (!ids.length) return null;
    return {
      id: `${selectedContactId}:${activeTab}`,
      contactId: selectedContactId,
      accountId: "workspace",
      status: "resolved" as const,
      lastMessageAt: null,
      channelType: activeTab,
      inbox: {
        id: `channel_${activeTab}`,
        name: channelLabel(activeTab),
        channelType: activeTab,
      },
      contact: selectedContact,
      messages: [],
    } satisfies Conversation;
  }, [
    selectedContactId,
    selectedContact,
    contactConversations,
    activeTab,
    channelsReady,
    enabledSet,
  ]);

  const {
    data: messages,
    isPending: messagesPending,
  } = useMessages(selectedConversation?.id);
  const showInitialMessagesLoader = messagesPending && messages === undefined;

  useEffect(() => {
    if (!channelsReady) return;
    if (!enabledChannels.length) return;
    if (!enabledChannels.includes(activeTab)) {
      setActiveTab(enabledChannels[0]!);
    }
  }, [enabledChannels, activeTab, channelsReady]);

  /** Drop channel filter if that channel was disconnected. */
  useEffect(() => {
    if (!channelsReady) return;
    if (channelFilter === "all") return;
    if (!enabledChannels.includes(channelFilter)) {
      setChannelFilter("all");
    }
  }, [channelsReady, enabledChannels, channelFilter]);

  /** Align open thread with the list channel scope when the filter changes. */
  useEffect(() => {
    if (channelFilter === "all" || !selectedContactId) return;
    const rows = conversationsByContact[selectedContactId];
    if (rows?.some((c) => c.channelType === channelFilter)) {
      setActiveTab(channelFilter);
    }
    // Only when the filter changes — polls must not steal the agent's tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [channelFilter]);

  /**
   * Once per contact open (including after data arrives), focus unresolved channel.
   * Polls/refetches won't steal the tab the agent chose.
   * Contacts → Chat: if no threads yet, pick first channel with an identity.
   * When a list channel filter is active, prefer that channel if present.
   */
  useEffect(() => {
    if (!selectedContactId) {
      focusedContactRef.current = null;
      return;
    }
    if (focusedContactRef.current === selectedContactId) return;
    const rows = conversationsByContact[selectedContactId];
    if (rows?.length) {
      focusedContactRef.current = selectedContactId;
      const scoped =
        channelFilter !== "all"
          ? rows.find((c) => c.channelType === channelFilter)
          : null;
      setActiveTab(scoped?.channelType ?? pickPrimaryConversation(rows).channelType);
      setStatusFilter("all");
      return;
    }
    const contact = directoryContacts?.find((c) => c.id === selectedContactId);
    if (!contact) return;
    focusedContactRef.current = selectedContactId;
    setStatusFilter("all");
    if (
      channelFilter !== "all" &&
      (!channelsReady || enabledSet.has(channelFilter)) &&
      identitiesFor(contact, channelFilter).length > 0
    ) {
      setActiveTab(channelFilter);
      return;
    }
    const preferred = (["whatsapp", "email", "instagram"] as ChannelType[]).find((ch) => {
      if (channelsReady && !enabledSet.has(ch)) return false;
      return identitiesFor(contact, ch).length > 0;
    });
    if (preferred) setActiveTab(preferred);
    else if (enabledChannels[0]) setActiveTab(enabledChannels[0]);
  }, [
    selectedContactId,
    conversationsByContact,
    directoryContacts,
    channelsReady,
    enabledSet,
    enabledChannels,
    channelFilter,
  ]);

  const handleSelectConversation = (conversation: Conversation) => {
    const contactId = conversation.contactId;
    const rows = conversationsByContact[contactId] ?? [conversation];
    focusedContactRef.current = contactId;
    setSelectedContactId(contactId);
    if (channelFilter !== "all" && rows.some((c) => c.channelType === channelFilter)) {
      setActiveTab(channelFilter);
    } else {
      setActiveTab(pickPrimaryConversation(rows).channelType);
    }
  };

  const handleSend = async (content: string, subject?: string): Promise<boolean> => {
    if (!selectedConversation || !selectedContactId) return false;
    const channel = selectedConversation.channelType;
    const conversationId = selectedConversation.id;

    try {
      const data = await sendMessage.mutateAsync({ id: conversationId, content, subject });
      if (!data.result?.ok || !data.message) {
        toast.error(data.result?.error || "Message failed to send on channel");
        return false;
      }
      toast.success(`${channelLabel(channel)} reply sent`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
      return false;
    }
  };

  const handleResolve = () => {
    if (!selectedConversation || !selectedContactId) return;
    const channel = selectedConversation.channelType;
    const resolvedId = selectedConversation.id;

    updateStatus.mutate(
      { id: resolvedId, status: "resolved" },
      {
        onSuccess: () => {
          toast.success(`${channelLabel(channel)} resolved`);
        },
        onError: (err) => toast.error(err.message || "Failed to resolve channel"),
      },
    );
  };

  const handleClearChat = () => {
    if (!selectedConversation || !selectedContactId) return;
    setPendingDelete({
      kind: "clear",
      conversationId: selectedConversation.id,
      channel: selectedConversation.channelType,
    });
  };

  const handleDeleteMessages = (messageIds: string[]): Promise<boolean> => {
    if (!selectedConversation || messageIds.length === 0) return Promise.resolve(false);
    return new Promise((resolve) => {
      setPendingDelete({
        kind: "messages",
        conversationId: selectedConversation.id,
        channel: selectedConversation.channelType,
        messageIds,
        resolve,
      });
    });
  };

  const closeDeleteDialog = (ok = false) => {
    if (pendingDelete?.kind === "messages") pendingDelete.resolve(ok);
    setPendingDelete(null);
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return;

    if (pendingDelete.kind === "clear") {
      const { conversationId, channel } = pendingDelete;
      suppressConversation.mutate(conversationId, {
        onSuccess: () => {
          toast.success(`${channelLabel(channel)} conversation cleared`);
          setPendingDelete(null);
        },
        onError: (err) => {
          toast.error(err.message || "Failed to clear conversation");
          setPendingDelete(null);
        },
      });
      return;
    }

    const { conversationId, messageIds, resolve } = pendingDelete;
    try {
      await deleteMessages.mutateAsync({ id: conversationId, messageIds });
      toast.success(
        messageIds.length === 1
          ? "Message deleted"
          : `${messageIds.length} messages deleted`,
      );
      resolve(true);
      setPendingDelete(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete messages");
      resolve(false);
      setPendingDelete(null);
    }
  };

  const deleteDialogBusy =
    (pendingDelete?.kind === "clear" && suppressConversation.isPending) ||
    (pendingDelete?.kind === "messages" && deleteMessages.isPending);

  const deleteDialogTitle =
    pendingDelete?.kind === "clear"
      ? `Clear ${channelLabel(pendingDelete.channel)} conversation?`
      : pendingDelete?.kind === "messages"
        ? `Delete ${pendingDelete.messageIds.length} ${channelLabel(pendingDelete.channel)} message${
            pendingDelete.messageIds.length === 1 ? "" : "s"
          }?`
        : "";

  const deleteDialogDescription =
    pendingDelete?.kind === "clear" ? (
      <>
        This removes every {channelLabel(pendingDelete.channel)} message for this contact.
        New messages from the customer will still appear.
      </>
    ) : pendingDelete?.kind === "messages" ? (
      <>
        This removes the selected message
        {pendingDelete.messageIds.length === 1 ? "" : "s"}. This cannot be undone.
      </>
    ) : null;

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-background">
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={deleteDialogTitle}
        description={deleteDialogDescription}
        confirmLabel={pendingDelete?.kind === "clear" ? "Clear conversation" : "Delete"}
        cancelLabel="Cancel"
        destructive
        confirming={deleteDialogBusy}
        onConfirm={() => void confirmPendingDelete()}
        onCancel={() => closeDeleteDialog(false)}
      />
      <section className="flex w-[340px] shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="text-base font-semibold tracking-tight text-foreground">Inbox</h1>
            <LivePulse active={conversationsFetching || !conversationsPending} />
          </div>
          <div className="flex h-8 shrink-0 items-center rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={cn(
                "h-full rounded px-2.5 text-[11px] font-medium leading-none",
                statusFilter === "active"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Unresolved
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "h-full rounded px-2.5 text-[11px] font-medium leading-none",
                statusFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
          </div>
        </div>

        <div className="space-y-2.5 border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts"
              className="h-9 w-full rounded-md border border-border bg-background py-0 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div
            className="flex gap-1 overflow-x-auto scrollbar-hide"
            role="tablist"
            aria-label="Channel filter"
          >
            {channelFilterOptions.map((option) => {
              const selected = channelFilter === option.id;
              const Icon =
                option.id === "all" ? null : CHANNEL_FILTER_ICONS[option.id];
              const shortLabel =
                option.id === "whatsapp"
                  ? "WA"
                  : option.id === "instagram"
                    ? "IG"
                    : option.label;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setChannelFilter(option.id)}
                  title={option.label}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium leading-none transition-colors",
                    selected
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {Icon ? <Icon className="h-3 w-3" /> : null}
                  <span>{shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {showInitialListLoader ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ConversationList
            conversations={listConversations}
            channelConversationsByContact={conversationsByContact}
            selectedContactId={selectedContactId}
            onSelect={handleSelectConversation}
            emptyHint={listEmptyHint}
          />
        )}
      </section>

      {!selectedContactId || !selectedContact ? (
        <ConversationEmptyState />
      ) : (
        <ConversationThread
          contactName={contactDisplayName(selectedContact)}
          contact={selectedContact}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          conversationsByChannel={contactConversations}
          selectedConversation={selectedConversation}
          messages={messages}
          loadingMessages={showInitialMessagesLoader}
          onResolve={handleResolve}
          resolving={updateStatus.isPending}
          onClearChat={handleClearChat}
          clearingChat={suppressConversation.isPending}
          onDeleteMessages={handleDeleteMessages}
          deletingMessages={deleteMessages.isPending}
          onSend={handleSend}
          sending={sendMessage.isPending}
          customerContextOpen={customerContextOpen}
          onToggleCustomerContext={() => setCustomerContextOpen((open) => !open)}
          enabledChannels={enabledChannels}
        />
      )}

      {customerContextOpen && (
        <CustomerDetails
          contact={selectedContact}
          conversationsByChannel={contactConversations}
          onClose={() => setCustomerContextOpen(false)}
        />
      )}
    </div>
  );
}
