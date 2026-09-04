import { useState, useMemo, useRef } from "react";
import {
  useWhatsAppTemplates,
  useContacts,
  useAccounts,
  useBroadcasts,
  useSendBroadcast,
  useFeatureFlag,
  useEnabledChannelTypes,
  useContactTags,
  type WhatsAppTemplate,
  type BroadcastJob,
} from "../../api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Loader2,
  Radio,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Lock,
  BarChart3,
  X,
  Tag,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractTemplateVariables(template: WhatsAppTemplate): string[] {
  const vars: Set<string> = new Set();
  for (const comp of template.components ?? []) {
    const texts = [
      comp.text ?? "",
      ...(comp.buttons ?? []).map((b: any) => b.text ?? ""),
    ];
    for (const t of texts) {
      const matches = String(t).matchAll(/\{\{(\d+)\}\}/g);
      for (const m of matches) vars.add(m[1]);
    }
  }
  return [...vars].sort((a, b) => Number(a) - Number(b));
}

function renderTemplatePreview(
  template: WhatsAppTemplate,
  variables: Record<string, string>,
): string {
  const body = template.components?.find((c: any) => c.type === "BODY");
  if (!body?.text) return "";
  return String(body.text).replace(/\{\{(\d+)\}\}/g, (_m, n) => variables[n] || `{{${n}}}`);
}

function statusBadge(status: BroadcastJob["status"]) {
  const cfg = {
    pending: {
      label: "Sending…",
      cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    },
    completed: {
      label: "Completed",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    },
    partial: {
      label: "Partial",
      cls: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20",
    },
    failed: {
      label: "Failed",
      cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    },
  };
  const c = cfg[status] ?? cfg.failed;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function TemplatePreviewCard({
  template,
  variables,
}: {
  template: WhatsAppTemplate;
  variables: Record<string, string>;
}) {
  const preview = renderTemplatePreview(template, variables);
  const header = template.components?.find((c: any) => c.type === "HEADER");
  const footer = template.components?.find((c: any) => c.type === "FOOTER");
  const buttons = template.components?.find((c: any) => c.type === "BUTTONS");

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {header?.text && (
        <div className="border-b border-border bg-muted/50 px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Header</p>
          <p className="mt-0.5 text-sm font-medium">{header.text}</p>
        </div>
      )}
      <div className="px-4 py-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {preview || (
            <span className="italic text-muted-foreground">Fill variables to see preview…</span>
          )}
        </p>
      </div>
      {footer?.text && (
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{footer.text}</div>
      )}
      {buttons?.buttons?.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          {buttons.buttons.map((b: any, i: number) => (
            <span
              key={i}
              className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary font-medium"
            >
              {b.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BroadcastResultModal({
  result,
  onClose,
}: {
  result: { total: number; succeeded: number; failed: number; status: string } | null;
  onClose: () => void;
}) {
  if (!result) return null;
  const isPending = result.status === "pending";
  const isOk = result.status === "completed";
  const isPartial = result.status === "partial";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl"
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mb-6 flex items-center gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                isPending
                  ? "bg-blue-100 dark:bg-blue-500/10"
                  : isOk
                  ? "bg-emerald-100 dark:bg-emerald-500/10"
                  : isPartial
                  ? "bg-yellow-100 dark:bg-yellow-500/10"
                  : "bg-red-100 dark:bg-red-500/10"
              }`}
            >
              {isPending ? (
                <Loader2 className="h-7 w-7 text-blue-600 dark:text-blue-400 animate-spin" />
              ) : isOk ? (
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              ) : isPartial ? (
                <AlertTriangle className="h-7 w-7 text-yellow-600 dark:text-yellow-400" />
              ) : (
                <XCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {isPending ? "Broadcast Queued!" : isOk ? "Broadcast Sent!" : isPartial ? "Partially Sent" : "Broadcast Failed"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isPending
                  ? "Your broadcast is processing in the background."
                  : isOk
                  ? "All messages delivered successfully."
                  : isPartial
                  ? "Some messages could not be delivered."
                  : "No messages were delivered."}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total", value: result.total, cls: "text-foreground" },
              { label: "Sent", value: result.succeeded, cls: "text-emerald-600 dark:text-emerald-400" },
              { label: "Failed", value: result.failed, cls: "text-red-600 dark:text-red-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-background p-3 text-center">
                <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
          <Button className="mt-6 w-full" onClick={onClose}>
            {isPending ? "View History" : "Done"}
          </Button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function HistoryJobRow({ job }: { job: BroadcastJob }) {
  const [expanded, setExpanded] = useState(false);
  const deliveredCount = job.recipients.filter(r => r.status === "delivered" || r.deliveredAt || r.readAt).length;
  const readCount = job.recipients.filter(r => r.readAt).length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            {job.status === "pending" ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Radio className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{job.templateName}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(job.createdAt).toLocaleString()} &middot; {job.total} contact
              {job.total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          {statusBadge(job.status)}
          
          <div className="hidden sm:flex items-center gap-4 border-l border-border pl-4">
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{job.succeeded}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sent</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{deliveredCount}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Dlvrd</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">{readCount}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Read</span>
            </div>
          </div>

          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground ml-2" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground ml-2" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {job.recipients.map((r) => {
            const isDelivered = r.status === "delivered" || r.deliveredAt;
            const isRead = !!r.readAt;
            return (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                <div
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    r.status === "failed" 
                      ? "bg-red-500" 
                      : isRead 
                        ? "bg-purple-500" 
                        : isDelivered 
                          ? "bg-blue-500" 
                          : "bg-emerald-500"
                  }`}
                />
                <span className="flex-1 text-sm text-foreground truncate">
                  {r.customerName || r.customerId}
                </span>
                {r.error && (
                  <span className="text-xs text-red-500 truncate max-w-[200px]">{r.error}</span>
                )}
                
                <span
                  className={`text-xs font-medium ${
                    r.status === "failed"
                      ? "text-red-600 dark:text-red-400"
                      : isRead
                        ? "text-purple-600 dark:text-purple-400"
                        : isDelivered
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {r.status === "failed" 
                    ? "Failed" 
                    : isRead 
                      ? "Read" 
                      : isDelivered 
                        ? "Delivered" 
                        : "Sent"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function BroadcastPage() {
  const { data: accounts } = useAccounts();
  const accountId = accounts?.[0]?.id ?? "";

  const { data: featureFlag, isLoading: flagLoading } = useFeatureFlag("broadcast_enabled");
  const { enabledChannels } = useEnabledChannelTypes();
  const hasWhatsApp = enabledChannels.includes("whatsapp");

  const { data: templates = [], isLoading: templatesLoading } = useWhatsAppTemplates();
  const { data: contacts = [], isLoading: contactsLoading } = useContacts(accountId);
  const { data: broadcastJobs = [], isLoading: jobsLoading } = useBroadcasts();
  const { data: allTags = [] } = useContactTags();
  const sendBroadcast = useSendBroadcast();

  const [activeTab, setActiveTab] = useState<"new" | "history">("new");

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const templateDropRef = useRef<HTMLDivElement>(null);

  const [variables, setVariables] = useState<Record<string, string>>({});

  const [tagFilter, setTagFilter] = useState<string>("");
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  const [result, setResult] = useState<{
    total: number;
    succeeded: number;
    failed: number;
    status: string;
  } | null>(null);

  const approvedTemplates = useMemo(
    () => templates.filter((t) => t.status === "APPROVED"),
    [templates],
  );

  const filteredTemplates = useMemo(
    () =>
      approvedTemplates.filter(
        (t) =>
          t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
          t.language.toLowerCase().includes(templateSearch.toLowerCase()),
      ),
    [approvedTemplates, templateSearch],
  );

  const selectedTemplate = approvedTemplates.find((t) => t.id === selectedTemplateId) ?? null;
  const templateVars = selectedTemplate ? extractTemplateVariables(selectedTemplate) : [];

  const waContacts = useMemo(
    () =>
      contacts.filter(
        (c) => (c.whatsappId || (c.whatsappIds?.length ?? 0) > 0) && c.whatsappEnabled !== false,
      ),
    [contacts],
  );

  const filteredContacts = useMemo(() => {
    let list = waContacts;
    if (tagFilter) list = list.filter((c) => c.tag === tagFilter);
    if (contactSearch) {
      const q = contactSearch.toLowerCase();
      list = list.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.whatsappId ?? "").includes(q),
      );
    }
    return list;
  }, [waContacts, tagFilter, contactSearch]);

  const allVisible =
    filteredContacts.length > 0 && filteredContacts.every((c) => selectedContactIds.has(c.id));

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allVisible) {
      setSelectedContactIds((prev) => {
        const next = new Set(prev);
        filteredContacts.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedContactIds((prev) => {
        const next = new Set(prev);
        filteredContacts.forEach((c) => next.add(c.id));
        return next;
      });
    }
  };

  const handleSend = async () => {
    if (!selectedTemplateId) { toast.error("Please select a template"); return; }
    if (selectedContactIds.size === 0) { toast.error("Please select at least one contact"); return; }
    const missingVar = templateVars.find((v) => !variables[v]?.trim());
    if (missingVar) { toast.error(`Please fill variable {{${missingVar}}}`); return; }

    try {
      const res = await sendBroadcast.mutateAsync({
        templateId: selectedTemplateId,
        customerIds: [...selectedContactIds],
        variables,
        ...(tagFilter ? { tag: tagFilter } : {}),
      });
      setResult({ total: res.total, succeeded: res.succeeded, failed: res.failed, status: res.status });
      setSelectedContactIds(new Set());
      setActiveTab("history");
      toast.success(`Broadcast sent: ${res.succeeded}/${res.total} delivered`);
    } catch (err: any) {
      toast.error(err.message || "Broadcast failed");
    }
  };

  const resetForm = () => {
    setSelectedTemplateId("");
    setVariables({});
    setSelectedContactIds(new Set());
    setContactSearch("");
    setTemplateSearch("");
    setTagFilter("");
  };

  if (flagLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!featureFlag?.enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
          <Lock className="h-9 w-9 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Broadcasting is disabled</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Contact your system administrator to enable{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">broadcast_enabled</code>{" "}
            in the admin panel.
          </p>
        </div>
      </div>
    );
  }

  if (!hasWhatsApp) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
          <Radio className="h-9 w-9 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">WhatsApp not connected</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Broadcasting requires a connected WhatsApp inbox. Configure it in Settings first.
          </p>
        </div>
      </div>
    );
  }

  const isSending = sendBroadcast.isPending;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <BroadcastResultModal result={result} onClose={() => setResult(null)} />

      <div className="border-b border-border bg-card/50 px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Radio className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Broadcast</h1>
              <p className="text-sm text-muted-foreground">
                Send a WhatsApp template to multiple contacts at once
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex gap-1 border-b border-border -mb-6 pb-0">
          {(["new", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "new" ? <Send className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
              {tab === "new" ? "New Broadcast" : `History (${broadcastJobs.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-6 sm:px-8">
        {activeTab === "new" && (
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Step 1 – Template */}
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</div>
                <h2 className="text-base font-semibold">Select Template</h2>
                <span className="ml-auto text-xs text-muted-foreground">{approvedTemplates.length} approved</span>
              </div>

              {templatesLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : approvedTemplates.length === 0 ? (
                <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                  No approved WhatsApp templates found. Create and submit templates for approval first.
                </p>
              ) : (
                <div ref={templateDropRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setTemplateDropdownOpen((p) => !p)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className={selectedTemplate ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {selectedTemplate
                        ? `${selectedTemplate.name} (${selectedTemplate.language})`
                        : "Choose an approved template…"}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${templateDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {templateDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card shadow-xl"
                      >
                        <div className="border-b border-border p-2">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search templates…"
                              value={templateSearch}
                              onChange={(e) => setTemplateSearch(e.target.value)}
                              className="w-full rounded-md bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 border border-border"
                            />
                          </div>
                        </div>
                        <div className="max-h-52 overflow-y-auto divide-y divide-border">
                          {filteredTemplates.length === 0 ? (
                            <p className="px-4 py-4 text-center text-sm text-muted-foreground">No templates match</p>
                          ) : (
                            filteredTemplates.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => { setSelectedTemplateId(t.id); setVariables({}); setTemplateDropdownOpen(false); }}
                                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${t.id === selectedTemplateId ? "bg-primary/5 text-primary font-medium" : ""}`}
                              >
                                <span>{t.name}</span>
                                <span className="text-xs text-muted-foreground">{t.language}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {selectedTemplate && templateVars.length > 0 && (
                <div className="mt-5 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Template Variables</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {templateVars.map((v) => (
                      <div key={v}>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{`{{${v}}}`}</label>
                        <Input
                          placeholder={`Value for {{${v}}}`}
                          value={variables[v] ?? ""}
                          onChange={(e) => setVariables((p) => ({ ...p, [v]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedTemplate && (
                <div className="mt-5">
                  <p className="mb-2 text-sm font-medium text-muted-foreground">Preview</p>
                  <TemplatePreviewCard template={selectedTemplate} variables={variables} />
                </div>
              )}
            </section>

            {/* Step 2 – Recipients */}
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</div>
                <h2 className="text-base font-semibold">Select Recipients</h2>
                {selectedContactIds.size > 0 && (
                  <span className="ml-auto rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
                    {selectedContactIds.size} selected
                  </span>
                )}
              </div>

              {contactsLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : waContacts.length === 0 ? (
                <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">No contacts with a WhatsApp number found.</p>
              ) : (
                <>
                  {/* Tag filter pills */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Filter by tag:</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setTagFilter(""); setSelectedContactIds(new Set()); }}
                      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${!tagFilter ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                    >
                      All ({waContacts.length})
                    </button>
                    {allTags.map((t) => {
                      const count = waContacts.filter((c) => c.tag === t).length;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setTagFilter(t === tagFilter ? "" : t); setSelectedContactIds(new Set()); }}
                          className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${tagFilter === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {t} ({count})
                        </button>
                      );
                    })}
                  </div>

                  <div className="mb-3 flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Search by name or number…"
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      {allVisible ? "Deselect All" : "Select All"}
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                    {filteredContacts.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        {tagFilter ? `No contacts with tag "${tagFilter}"` : "No contacts match"}
                      </p>
                    ) : (
                      filteredContacts.map((c) => {
                        const selected = selectedContactIds.has(c.id);
                        const wa = c.whatsappIds?.[0] ?? c.whatsappId ?? "";
                        return (
                          <label
                            key={c.id}
                            className={`flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30 ${selected ? "bg-primary/5" : ""}`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded accent-primary"
                              checked={selected}
                              onChange={() => toggleContact(c.id)}
                            />
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {c.name ? c.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium">{c.name || "—"}</p>
                                {c.tag && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    <Tag className="h-2 w-2" />
                                    {c.tag}
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{wa || "No number"}</p>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </section>

            {/* Send bar */}
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
              <div className="text-sm text-muted-foreground">
                {selectedContactIds.size > 0 && selectedTemplate ? (
                  <span>
                    Ready to send{" "}
                    <span className="font-semibold text-foreground">{selectedTemplate.name}</span> to{" "}
                    <span className="font-semibold text-foreground">{selectedContactIds.size}</span>{" "}
                    contact{selectedContactIds.size !== 1 ? "s" : ""}
                    {tagFilter && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium">
                        <Tag className="h-2.5 w-2.5" />
                        {tagFilter}
                      </span>
                    )}
                  </span>
                ) : (
                  "Complete the steps above to send"
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetForm} disabled={isSending}>Reset</Button>
                <Button
                  onClick={handleSend}
                  disabled={isSending || !selectedTemplateId || selectedContactIds.size === 0}
                  className="gap-2"
                >
                  {isSending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
                  ) : (
                    <><Send className="h-4 w-4" />Send Broadcast</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="mx-auto max-w-4xl space-y-4">
            {jobsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : broadcastJobs.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">No broadcasts yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Your broadcast history will appear here.</p>
                </div>
                <Button variant="outline" onClick={() => setActiveTab("new")}>
                  <Send className="mr-2 h-4 w-4" />Create Broadcast
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {broadcastJobs.length} broadcast{broadcastJobs.length !== 1 ? "s" : ""} sent
                </p>
                {broadcastJobs.map((job) => (
                  <HistoryJobRow key={job.id} job={job} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
