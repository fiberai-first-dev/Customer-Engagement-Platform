import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useState, useMemo } from "react";
import { Search, MoreHorizontal, Plus, Edit2, Loader2 } from "lucide-react";
import { useAccounts, useContacts } from "../../api";
import { ContactModal, type ContactFormData } from "../../components/contacts/ContactModal";

function joinList(primary: string | null | undefined, list?: string[] | null): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(list ?? []), primary]) {
    const v = raw?.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.length ? out.join(", ") : "—";
}

export function ContactsPage() {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const accountId = accounts?.[0]?.id || "";
  const { data: contacts, isLoading: contactsLoading } = useContacts(accountId);
  const [searchQuery, setSearchQuery] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactFormData | null>(null);

  const isLoading = accountsLoading || (!!accountId && contactsLoading);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!searchQuery.trim()) return contacts;
    const lowerQuery = searchQuery.toLowerCase();
    return contacts.filter((c) => {
      const haystack = [
        c.id,
        c.name,
        c.email,
        c.whatsappId,
        ...(c.emails ?? []),
        ...(c.whatsappIds ?? []),
        c.identifiers?.instagram,
        c.identifiers?.whatsapp,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(lowerQuery);
    });
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
      instagramId: c.identifiers?.instagram || "",
    });
    setIsModalOpen(true);
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <div className="border-b border-border bg-card/50 p-8 pb-4">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <Button className="gap-2" onClick={openCreate} disabled={!accountId || accountsLoading}>
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search contacts"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/20 p-8">
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="border-b border-border px-6 py-4 font-medium">ID</th>
                  <th className="border-b border-border px-6 py-4 font-medium">Name</th>
                  <th className="border-b border-border px-6 py-4 font-medium">Email</th>
                  <th className="border-b border-border px-6 py-4 font-medium">WhatsApp</th>
                  <th className="border-b border-border px-6 py-4 font-medium">Instagram</th>
                  <th className="w-16 border-b border-border px-6 py-4 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border" onClick={() => setOpenDropdownId(null)}>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {!isLoading && filteredContacts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      No contacts yet
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  filteredContacts.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-muted/30">
                      <td className="break-all px-6 py-4 font-mono text-xs text-muted-foreground">
                        {c.id}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {c.name
                              ? c.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2)
                              : "?"}
                          </div>
                          <span className="font-medium">{c.name || "—"}</span>
                        </div>
                      </td>
                      <td className="max-w-[220px] break-words px-6 py-4 text-muted-foreground">
                        {joinList(c.email, c.emails)}
                      </td>
                      <td className="max-w-[180px] break-words px-6 py-4 text-muted-foreground">
                        {joinList(c.whatsappId ?? c.identifiers?.whatsapp, c.whatsappIds)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {(() => {
                          const igIdentity = c.identities?.find((i) => i.channel === "instagram");
                          const igName = (igIdentity?.metadata as { senderName?: string } | undefined)
                            ?.senderName;
                          const ig =
                            (igName?.startsWith("@") ? igName : igName ? `@${igName}` : null) ||
                            (c.identifiers?.instagram ? `@${c.identifiers.instagram.replace(/^@/, "")}` : null);
                          return ig || "—";
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative">
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
                            <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-md">
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
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
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
      />
    </div>
  );
}
