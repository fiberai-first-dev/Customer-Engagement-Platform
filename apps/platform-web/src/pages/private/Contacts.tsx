import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MoreHorizontal, Plus, Edit2, Trash2, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import {
  useAccounts,
  useContacts,
  useDeleteContact,
  useEnabledChannelTypes,
} from "../../api";
import { ContactModal, type ContactFormData } from "../../components/contacts/ContactModal";
import { formatWhatsAppDisplay } from "../../components/inbox/utils";
import { useAppStore } from "../../store";

function joinList(primary: string | null | undefined, list?: string[] | null): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(list ?? []), primary]) {
    const v = raw?.trim();
    if (!v) continue;
    const key = v.replace(/[^\d]/g, "") || v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.length ? out.join(", ") : "—";
}

function instagramUsernameForEdit(c: {
  instagramId?: string | null;
  instagramDetails?: { username?: string | null } | null;
  identifiers?: { instagram?: string } | null;
  identities?: Array<{
    channel?: string;
    displayId?: string;
    metadata?: { username?: string | null };
  }>;
}): string {
  const candidates = [
    c.instagramDetails?.username,
    c.identities?.find((i) => i.channel === "instagram")?.metadata?.username,
    c.identities?.find((i) => i.channel === "instagram")?.displayId,
    c.instagramId,
    c.identifiers?.instagram,
  ]
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
    .map((v) => v.replace(/^@/, "").trim());

  const username = candidates.find((v) => v && !/^\d{5,}$/.test(v));
  return username ?? "";
}

function instagramUsernameForTable(c: {
  instagramId?: string | null;
  instagramDetails?: { username?: string | null; senderName?: string | null } | null;
  identifiers?: { instagram?: string } | null;
  identities?: Array<{
    channel?: string;
    displayId?: string;
    metadata?: { username?: string | null; senderName?: string | null };
  }>;
}): string {
  const handle = instagramUsernameForEdit(c);
  if (handle) return `@${handle}`;
  return "—";
}

function joinWhatsApp(primary: string | null | undefined, list?: string[] | null): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(list ?? []), primary]) {
    const v = raw?.trim();
    if (!v) continue;
    const formatted = formatWhatsAppDisplay(v);
    const key = formatted.replace(/[^\d]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(formatted);
  }
  return out.length ? out.join(", ") : "—";
}

function matchesSearch(
  haystackParts: Array<string | null | undefined>,
  query: string,
): boolean {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return true;
  const text = haystackParts.filter(Boolean).join(" ").toLowerCase();
  if (text.includes(lowerQuery)) return true;
  const digitsQuery = lowerQuery.replace(/[^\d]/g, "");
  if (digitsQuery.length < 4) return false;
  const digitsHay = text.replace(/[^\d]/g, "");
  return digitsHay.includes(digitsQuery);
}

export function ContactsPage() {
  const navigate = useNavigate();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const accountId = accounts?.[0]?.id || "";
  const { data: contacts, isLoading: contactsLoading } = useContacts(accountId);
  const { enabledChannels, channelsReady } = useEnabledChannelTypes();
  const deleteContact = useDeleteContact();
  const { selectedContactId, setSelectedContactId } = useAppStore();
  const showEmail = !channelsReady || enabledChannels.includes("email");
  const showWa = !channelsReady || enabledChannels.includes("whatsapp");
  const showIg = !channelsReady || enabledChannels.includes("instagram");
  const [searchQuery, setSearchQuery] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactFormData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const isLoading = accountsLoading || (!!accountId && contactsLoading);
  const colCount = 2 + Number(showEmail) + Number(showWa) + Number(showIg);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!searchQuery.trim()) return contacts;
    return contacts.filter((c) =>
      matchesSearch(
        [
          c.id,
          c.name,
          c.email,
          c.whatsappId,
          ...(c.emails ?? []),
          ...(c.whatsappIds ?? []),
          c.identifiers?.instagram,
          c.identifiers?.whatsapp,
        ],
        searchQuery,
      ),
    );
  }, [contacts, searchQuery]);

  const openCreate = () => {
    setEditingContact(null);
    setIsModalOpen(true);
  };

  const openEdit = (c: (typeof filteredContacts)[number]) => {
    setOpenDropdownId(null);
    setEditingContact({
      id: c.id,
      name: c.name || "",
      emails: c.emails?.length ? c.emails : c.email ? [c.email] : [""],
      whatsappIds: c.whatsappIds?.length
        ? c.whatsappIds
        : c.whatsappId || c.identifiers?.whatsapp
          ? [c.whatsappId || c.identifiers!.whatsapp]
          : [""],
      instagramId: instagramUsernameForEdit(c),
    });
    setIsModalOpen(true);
  };

  const openChat = (c: (typeof filteredContacts)[number]) => {
    setOpenDropdownId(null);
    setSelectedContactId(c.id);
    navigate("/inbox");
  };

  const openDelete = (c: (typeof filteredContacts)[number]) => {
    setOpenDropdownId(null);
    setPendingDelete({ id: c.id, name: c.name?.trim() || "this contact" });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    deleteContact.mutate(id, {
      onSuccess: (result) => {
        if (selectedContactId === id) setSelectedContactId(null);
        toast.success(
          result.deletedMessages > 0
            ? `Deleted ${name} and ${result.deletedMessages} message${
                result.deletedMessages === 1 ? "" : "s"
              }`
            : `Deleted ${name}`,
        );
        setPendingDelete(null);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to delete contact");
        setPendingDelete(null);
      },
    });
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete contact?"
        description={
          <>
            This permanently removes <strong>{pendingDelete?.name}</strong> and all of their
            WhatsApp, Instagram, and Email conversations. This cannot be undone.
          </>
        }
        confirmLabel="Delete contact"
        cancelLabel="Cancel"
        destructive
        confirming={deleteContact.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <div className="border-b border-border bg-card/50 px-6 py-6 sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
            <p className="mt-1 text-sm text-muted-foreground">People you talk to across channels.</p>
          </div>
          <Button
            className="h-10 shrink-0 gap-2"
            onClick={openCreate}
            disabled={!accountId || accountsLoading}
          >
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder="Search by name, email, or number"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/20 px-6 py-6 sm:px-8">
        <Card className="overflow-hidden shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="border-b border-border px-5 py-3 font-medium">Name</th>
                    {showEmail && (
                      <th className="border-b border-border px-5 py-3 font-medium">Email</th>
                    )}
                    {showWa && (
                      <th className="border-b border-border px-5 py-3 font-medium">WhatsApp</th>
                    )}
                    {showIg && (
                      <th className="border-b border-border px-5 py-3 font-medium">Instagram</th>
                    )}
                    <th className="w-14 border-b border-border px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border" onClick={() => setOpenDropdownId(null)}>
                  {isLoading && (
                    <tr>
                      <td colSpan={colCount} className="px-5 py-12 text-center text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </td>
                    </tr>
                  )}
                  {!isLoading && filteredContacts.length === 0 && (
                    <tr>
                      <td colSpan={colCount} className="px-5 py-10 text-center text-muted-foreground">
                        No contacts yet
                      </td>
                    </tr>
                  )}
                  {!isLoading &&
                    filteredContacts.map((c) => (
                      <tr key={c.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-5 py-3.5 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                              {c.name
                                ? c.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .slice(0, 2)
                                : "?"}
                            </div>
                            <span className="truncate font-medium">{c.name || "—"}</span>
                          </div>
                        </td>
                        {showEmail && (
                          <td className="max-w-[220px] truncate px-5 py-3.5 align-middle text-muted-foreground">
                            {joinList(c.email, c.emails)}
                          </td>
                        )}
                        {showWa && (
                          <td className="max-w-[180px] truncate px-5 py-3.5 align-middle text-muted-foreground">
                            {joinWhatsApp(c.whatsappId ?? c.identifiers?.whatsapp, c.whatsappIds)}
                          </td>
                        )}
                        {showIg && (
                          <td className="px-5 py-3.5 align-middle text-muted-foreground">
                            {instagramUsernameForTable(c)}
                          </td>
                        )}
                        <td className="px-5 py-3.5 align-middle text-right">
                          <div className="relative inline-flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenDropdownId(openDropdownId === c.id ? null : c.id);
                              }}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            {openDropdownId === c.id && (
                              <div className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-md">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openChat(c);
                                  }}
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                  Chat
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEdit(c);
                                  }}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDelete(c);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <ContactModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingContact(null);
        }}
        initialData={editingContact}
        accountId={accountId}
        enabledChannels={enabledChannels}
      />
    </div>
  );
}
