import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useCreateContact, useUpdateContact } from "../../api";

export type ContactFormData = {
  id?: string;
  name: string;
  emails: string[];
  whatsappIds: string[];
  instagramId: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialData?: ContactFormData | null;
  accountId: string;
};

const emptyForm = (): ContactFormData => ({
  name: "",
  emails: [""],
  whatsappIds: [""],
  instagramId: "",
});

function MultiStringField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const rows = values.length ? values : [""];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">{label}</label>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={() => onChange([...rows, ""])}
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((value, idx) => (
          <div key={`${label}-${idx}`} className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => {
                const next = [...rows];
                next[idx] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
            />
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContactModal({ isOpen, onClose, initialData, accountId }: Props) {
  const [formData, setFormData] = useState<ContactFormData>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (initialData) {
      setFormData({
        id: initialData.id,
        name: initialData.name || "",
        emails: initialData.emails?.length ? initialData.emails : [""],
        whatsappIds: initialData.whatsappIds?.length ? initialData.whatsappIds : [""],
        instagramId: initialData.instagramId || "",
      });
    } else {
      setFormData(emptyForm());
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const isEditing = Boolean(initialData?.id);
  const isPending = createContact.isPending || updateContact.isPending;

  const cleanList = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!accountId) {
      setError("Workspace is not ready. Refresh and try again.");
      return;
    }

    const emails = cleanList(formData.emails);
    const whatsappIds = cleanList(formData.whatsappIds);
    const name = formData.name.trim();
    const instagramId = formData.instagramId.trim().replace(/^@+/, "");

    if (!name && !emails.length && !whatsappIds.length && !instagramId) {
      setError("Add a name or at least one email, WhatsApp number, or Instagram ID.");
      return;
    }

    try {
      const body = {
        name: name || undefined,
        emails,
        whatsappIds,
        email: emails[0],
        whatsappId: whatsappIds[0],
        instagramId: instagramId || undefined,
        emailId: emails[0] || undefined,
      };
      if (isEditing && initialData?.id) {
        await updateContact.mutateAsync({ id: initialData.id, body });
      } else {
        await createContact.mutateAsync({ accountId, ...body });
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save contact";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="contact-modal-title" className="text-lg font-semibold tracking-tight">
            {isEditing ? "Edit contact" : "Add contact"}
          </h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>

            <MultiStringField
              label="Email"
              values={formData.emails}
              onChange={(emails) => setFormData({ ...formData, emails })}
              placeholder="jane@example.com"
            />

            <MultiStringField
              label="WhatsApp"
              values={formData.whatsappIds}
              onChange={(whatsappIds) => setFormData({ ...formData, whatsappIds })}
              placeholder="919876543210"
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">Instagram</label>
              <Input
                value={formData.instagramId}
                onChange={(e) => setFormData({ ...formData, instagramId: e.target.value })}
                placeholder="username"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !accountId}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
