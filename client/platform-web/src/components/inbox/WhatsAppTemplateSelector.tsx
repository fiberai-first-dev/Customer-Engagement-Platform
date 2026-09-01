import { useState, useMemo } from "react";
import { MessageSquareText, Search, X, Send, ChevronLeft } from "lucide-react";
import { useWhatsAppTemplates, type WhatsAppTemplate } from "../../api";
import { Button } from "../ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onSelect: (template: WhatsAppTemplate, variables: Record<string, string>) => void;
  disabled?: boolean;
  variant?: "default" | "compact";
  /** When set, only templates with this internal category are shown */
  preferInternalCategory?: string;
  /** Pre-fills {{1}} (and auto-sends when it is the only variable) */
  contactName?: string;
}

function extractVariableIndices(template: WhatsAppTemplate): number[] {
  const parts: string[] = [];
  for (const c of template.components ?? []) {
    const type = String(c.type ?? "").toUpperCase();
    if ((type === "BODY" || type === "HEADER") && typeof c.text === "string") {
      parts.push(c.text);
    }
  }
  const text = parts.join(" ");
  const matches = text.match(/\{\{(\d+)\}\}/g) ?? [];
  const nums = [...new Set(matches.map((m) => parseInt(m.replace(/[{}]/g, ""), 10)))];
  return nums.sort((a, b) => a - b);
}

function getBodyText(template: WhatsAppTemplate): string {
  return (
    template.components?.find((c) => {
      const type = String(c.type ?? "").toUpperCase();
      return type === "BODY";
    })?.text ?? ""
  );
}

function defaultFirstName(contactName?: string): string {
  if (!contactName?.trim()) return "";
  const clean = contactName.replace(/^@+/, "").trim();
  return clean.split(/\s+/)[0] || clean;
}

function buildDefaultVariables(
  indices: number[],
  contactName?: string,
): Record<string, string> {
  const vars: Record<string, string> = {};
  if (indices.includes(1) && contactName) {
    vars["1"] = defaultFirstName(contactName);
  }
  return vars;
}

export function WhatsAppTemplateSelector({
  onSelect,
  disabled,
  variant = "default",
  preferInternalCategory,
  contactName,
}: Props) {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  const approvedTemplates = useMemo(() => {
    return templates
      .filter((t) => t.status === "APPROVED")
      .filter((t) =>
        preferInternalCategory ? t.internalCategory === preferInternalCategory : true,
      )
      .filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [templates, searchQuery, preferInternalCategory]);

  const handleClose = () => {
    setOpen(false);
    setSelectedTemplate(null);
    setVariables({});
    setSearchQuery("");
  };

  const handlePick = (template: WhatsAppTemplate) => {
    const indices = extractVariableIndices(template);
    if (indices.length === 0) {
      onSelect(template, {});
      handleClose();
      return;
    }

    const defaults = buildDefaultVariables(indices, contactName);
    const canAutoSend =
      indices.length === 1 && indices[0] === 1 && Boolean(defaults["1"]);

    if (canAutoSend) {
      onSelect(template, defaults);
      handleClose();
      return;
    }

    setVariables(defaults);
    setSelectedTemplate(template);
  };

  const renderPreview = () => {
    if (!selectedTemplate) return null;
    let text = getBodyText(selectedTemplate);
    const indices = extractVariableIndices(selectedTemplate);
    for (const i of indices) {
      const val = variables[`${i}`] || `{{${i}}}`;
      text = text.replace(new RegExp(`\\{\\{${i}\\}\\}`, "g"), val);
    }

    return (
      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-tl-none bg-[#E7FFDB] p-3 text-sm text-foreground shadow-sm dark:bg-[#005C4B]">
        {text}
      </div>
    );
  };

  if (!open) {
    const compact = variant === "compact";
    return (
      <Button
        type="button"
        size={compact ? "default" : "lg"}
        onClick={() => setOpen(true)}
        disabled={disabled || isLoading}
        className={
          compact
            ? "gap-2 shadow-sm"
            : "w-full border border-primary/20 bg-primary/10 font-medium text-primary shadow-sm hover:border-primary/30 hover:bg-primary/20"
        }
      >
        <MessageSquareText className="h-4 w-4" />
        {isLoading ? "Loading templates…" : "Choose re-engagement template"}
      </Button>
    );
  }

  const selectedIndices = selectedTemplate ? extractVariableIndices(selectedTemplate) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm sm:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            {selectedTemplate && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTemplate(null);
                  setVariables({});
                }}
                className="rounded-full p-1.5 transition-colors hover:bg-muted"
              >
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {selectedTemplate ? "Configure template" : "Select re-engagement template"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedTemplate
                  ? selectedTemplate.name
                  : "Approved templates for restarting conversations outside the 24-hour window."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-background">
          <AnimatePresence mode="wait">
            {!selectedTemplate ? (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.15 }}
                className="flex h-full flex-col"
              >
                <div className="border-b border-border p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search templates…"
                      className="w-full rounded-xl border-none bg-muted/50 py-2.5 pl-9 pr-4 text-sm transition-all focus:ring-2 focus:ring-primary/50"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {approvedTemplates.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center space-y-3 py-12 text-muted-foreground">
                      <MessageSquareText className="h-10 w-10 opacity-20" />
                      <p>No approved re-engagement templates.</p>
                      <p className="max-w-xs text-center text-xs">
                        Create a Customer Re-engagement template on the Templates page and wait for Meta approval.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {approvedTemplates.map((t) => (
                        <TemplateCard
                          key={t.id}
                          template={t}
                          getBodyText={getBodyText}
                          onPick={handlePick}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.15 }}
                className="flex h-full flex-col overflow-y-auto"
              >
                <div className="space-y-6 p-6">
                  <div className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquareText className="h-4 w-4 text-primary" />
                      Preview
                    </h3>
                    <div className="rounded-xl border border-border bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] p-4 shadow-inner">
                      {renderPreview()}
                    </div>
                  </div>

                  {selectedIndices.length > 0 && (
                    <div className="space-y-4 border-t border-border pt-4">
                      <h3 className="text-sm font-medium">Template variables</h3>
                      <div className="grid gap-4">
                        {selectedIndices.map((n, i) => (
                          <div key={n} className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Variable {`{{${n}}}`}
                            </label>
                            <input
                              type="text"
                              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm shadow-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/50"
                              value={variables[`${n}`] || ""}
                              onChange={(e) =>
                                setVariables((prev) => ({ ...prev, [`${n}`]: e.target.value }))
                              }
                              placeholder={`Enter value for {{${n}}}`}
                              autoFocus={i === 0}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-auto flex justify-end gap-3 border-t border-border bg-muted/30 p-4">
                  <Button variant="ghost" onClick={() => setSelectedTemplate(null)}>
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      onSelect(selectedTemplate, variables);
                      handleClose();
                    }}
                    className="gap-2 shadow-lg"
                    disabled={selectedIndices.some((n) => !variables[`${n}`]?.trim())}
                  >
                    <Send className="h-4 w-4" />
                    Send template
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function TemplateCard({
  template,
  getBodyText,
  onPick,
}: {
  template: WhatsAppTemplate;
  getBodyText: (t: WhatsAppTemplate) => string;
  onPick: (t: WhatsAppTemplate) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(template)}
      className="group flex h-full flex-col rounded-xl border border-border/50 bg-card p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/50 hover:shadow-md"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold transition-colors group-hover:text-primary">
          {template.name}
        </span>
        <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400">
          {template.language}
        </span>
      </div>
      <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">
        {getBodyText(template) || "No body content."}
      </p>
    </button>
  );
}
