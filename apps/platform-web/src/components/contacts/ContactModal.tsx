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
  emailId: string;
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
  emailId: "",
});

function MultiStringField({
  label,
  hint,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
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
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ContactModal({ isOpen, onClose, initialData, accountId }: Props) {
  const [formData, setFormData] = useState<ContactFormData>(emptyForm());
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        emails: initialData.emails?.length ? initialData.emails : [""],
        whatsappIds: initialData.whatsappIds?.length ? initialData.whatsappIds : [""],
      });
    } else {
      setFormData(emptyForm());
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const isEditing = !!initialData?.id;
  const isPending = createContact.isPending || updateContact.isPending;

  const cleanList = (values: string[]) =>
    values.map((v) => v.trim()).filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emails = cleanList(formData.emails);
    const whatsappIds = cleanList(formData.whatsappIds);
    try {
      const body = {
        name: formData.name || undefined,
        emails,
        whatsappIds,
        email: emails[0],
        whatsappId: whatsappIds[0],
        instagramId: formData.instagramId || undefined,
        emailId: formData.emailId || emails[0] || undefined,
      };
      if (isEditing && initialData?.id) {
        await updateContact.mutateAsync({ id: initialData.id, body });
      } else {
        await createContact.mutateAsync({ accountId, ...body });
      }
      onClose();
    } catch (err) {
      console.error("Failed to save contact:", err);
      alert("Failed to save contact. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {isEditing ? "Edit Contact" : "Add Contact"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Doe"
              />
            </div>

            <MultiStringField
              label="Emails"
              values={formData.emails}
              onChange={(emails) => setFormData({ ...formData, emails })}
              placeholder="john@example.com"
            />

            <MultiStringField
              label="WhatsApp number"
              values={formData.whatsappIds}
              onChange={(whatsappIds) => setFormData({ ...formData, whatsappIds })}
              placeholder="919876543210"
              hint="Same as the phone number used on WhatsApp. Add more if the person has multiple WA numbers."
            />

            <div className="space-y-4 border-t border-border pt-4">
              <h3 className="text-sm font-medium text-muted-foreground">Other channels</h3>
              <div className="space-y-2">
                <label className="text-sm font-medium">Instagram ID / username</label>
                <Input
                  value={formData.instagramId}
                  onChange={(e) => setFormData({ ...formData, instagramId: e.target.value })}
                  placeholder="@johndoe"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email channel ID</label>
                <Input
                  value={formData.emailId}
                  onChange={(e) => setFormData({ ...formData, emailId: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 rounded-b-xl border-t border-border bg-muted/40 px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : "Save Contact"}
          </Button>
        </div>
      </div>
    </div>
  );
}
