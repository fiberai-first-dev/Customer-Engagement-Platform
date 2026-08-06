import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useState, useMemo } from "react";

import { Search, MoreHorizontal } from "lucide-react";

import { useContacts } from "../../api";

export function ContactsPage() {
  const { data: contacts, isLoading } = useContacts();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!searchQuery.trim()) return contacts;
    const lowerQuery = searchQuery.toLowerCase();
    return contacts.filter((c) => {
      const nameMatch = c.name?.toLowerCase().includes(lowerQuery);
      const emailMatch = c.email?.toLowerCase().includes(lowerQuery);
      const phoneMatch = c.phone?.toLowerCase().includes(lowerQuery);
      const igMatch = c.identifiers?.instagram?.toLowerCase().includes(lowerQuery);
      return nameMatch || emailMatch || phoneMatch || igMatch;
    });
  }, [contacts, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="p-8 pb-4 border-b border-border bg-card/50">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Contacts</h1>
            <p className="text-muted-foreground">
              Manage your unified customer directory across all channels.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              className="pl-9" 
              placeholder="Search by name, email, phone or IG..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 bg-muted/20">
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-medium border-b border-border">Name</th>
                  <th className="px-6 py-4 font-medium border-b border-border">Email</th>
                  <th className="px-6 py-4 font-medium border-b border-border">Phone</th>
                  <th className="px-6 py-4 font-medium border-b border-border">Instagram</th>
                  <th className="px-6 py-4 font-medium border-b border-border w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(!filteredContacts || filteredContacts.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No contacts found.
                    </td>
                  </tr>
                )}
                {!isLoading && filteredContacts.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-xs">
                          {c.name ? c.name.split(" ").map(n => n[0]).join("") : "U"}
                        </div>
                        <span className="font-medium">{c.name || "Unknown"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{c.email || "-"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{c.phone || "-"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{c.identifiers?.instagram || "-"}</td>
                    <td className="px-6 py-4">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
