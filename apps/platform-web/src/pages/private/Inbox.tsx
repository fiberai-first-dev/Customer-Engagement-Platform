import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  useConversations,
  useEnabledChannelTypes,
  useMessages,
  useSendMessage,
  useUpdateConversation,
  type ChannelType,
  type Conversation,
} from "../../api";
import { useAppStore } from "../../store";
import {
  ConversationEmptyState,
  ConversationList,
  ConversationThread,
  CustomerDetails,
  LivePulse,
  channelLabel,
  cn,
  contactDisplayName,
  contactGlobalIsActive,
  nextUnresolvedConversation,
  pickPrimaryConversation,
} from "../../components/inbox";

export function InboxPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [activeTab, setActiveTab] = useState<ChannelType>("whatsapp");
  const [customerContextOpen, setCustomerContextOpen] = useState(true);
  const focusedContactRef = useRef<string | null>(null);

  const {
    data: conversations,
    isPending: conversationsPending,
    isFetching: conversationsFetching,
  } = useConversations("all");
  const { selectedContactId, setSelectedContactId } = useAppStore();

  const sendMessage = useSendMessage();
  const updateStatus = useUpdateConversation();
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
      const primary = pickPrimaryConversation(channelConvs);
      if (
        statusFilter === "active" &&
        !contactGlobalIsActive(primary.contact, channelConvs)
      ) {
        continue;
      }
      if (!query) {
        items.push(primary);
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
      if (matches) items.push(primary);
    }

    return items.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversationsByContact, statusFilter, searchQuery]);

  const selectedListConversation =
    listConversations.find((c) => c.contactId === selectedContactId) ??
    (selectedContactId && conversationsByContact[selectedContactId]
      ? pickPrimaryConversation(conversationsByContact[selectedContactId]!)
      : null);

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

  const selectedConversation = selectedContactId
    ? contactConversations[activeTab] ?? null
    : null;

  const selectedContact =
    selectedConversation?.contact ??
    selectedListConversation?.contact ??
    null;

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

  /**
   * Once per contact open (including after data arrives), focus unresolved channel.
   * Polls/refetches won't steal the tab the agent chose.
   */
  useEffect(() => {
    if (!selectedContactId) {
      focusedContactRef.current = null;
      return;
    }
    if (focusedContactRef.current === selectedContactId) return;
    const rows = conversationsByContact[selectedContactId];
    if (!rows?.length) return;
    focusedContactRef.current = selectedContactId;
    setActiveTab(pickPrimaryConversation(rows).channelType);
  }, [selectedContactId, conversationsByContact]);

  const handleSelectConversation = (conversation: Conversation) => {
    const contactId = conversation.contactId;
    const rows = conversationsByContact[contactId] ?? [conversation];
    focusedContactRef.current = contactId;
    setSelectedContactId(contactId);
    setActiveTab(pickPrimaryConversation(rows).channelType);
  };

  const handleSend = (content: string, subject?: string) => {
    if (!selectedConversation || !selectedContactId) return;
    const channel = selectedConversation.channelType;
    const conversationId = selectedConversation.id;
    const siblings = conversationsByContact[selectedContactId] ?? [];

    sendMessage.mutate(
      { id: conversationId, content, subject },
      {
        onSuccess: (data) => {
          if (!data.result?.ok) {
            toast.error(data.result?.error || "Message failed to send on channel");
            return;
          }
          // Successful agent reply resolves this channel — jump to another open one if any
          const next = nextUnresolvedConversation(siblings, conversationId);
          const nextDifferent =
            next && next.channelType !== channel ? next : null;
          if (nextDifferent) {
            setActiveTab(nextDifferent.channelType);
          }
        },
        onError: (err) => toast.error(err.message || "Failed to send message"),
      },
    );
  };

  const handleResolve = () => {
    if (!selectedConversation || !selectedContactId) return;
    const channel = selectedConversation.channelType;
    const resolvedId = selectedConversation.id;
    const siblings = conversationsByContact[selectedContactId] ?? [];

    updateStatus.mutate(
      { id: resolvedId, status: "resolved" },
      {
        onSuccess: () => {
          const next = nextUnresolvedConversation(siblings, resolvedId);
          // Prefer a *different* channel — same-channel switch is confusing in toasts/UX
          const nextDifferent =
            next && next.channelType !== channel ? next : null;

          if (nextDifferent) {
            setActiveTab(nextDifferent.channelType);
            toast.success(
              `${channelLabel(channel)} resolved · ${channelLabel(nextDifferent.channelType)} still unresolved`,
            );
            return;
          }

          toast.success(`${channelLabel(channel)} resolved`);
        },
        onError: (err) => toast.error(err.message || "Failed to resolve channel"),
      },
    );
  };

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-background">
      <section className="flex w-[360px] shrink-0 flex-col border-r border-border bg-card">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Inbox</h1>
              <LivePulse active={conversationsFetching || !conversationsPending} />
            </div>
            <div className="flex rounded-md border border-border p-0.5">
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium",
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
                  "rounded px-2 py-1 text-[11px] font-medium",
                  statusFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
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
