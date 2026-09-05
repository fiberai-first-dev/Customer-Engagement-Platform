import { useState, useMemo, useRef, useEffect } from "react";
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
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
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
  Tag,
  Users,
  FileText,
  Eye,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

function extractTemplateVariables(template: WhatsAppTemplate): string[] {
  const vars = new Set<string>();
  for (const comp of template.components ?? []) {
    const texts = [comp.text ?? "", ...(comp.buttons ?? []).map((b: any) => b.text ?? "")];
    for (const t of texts) {
      for (const m of String(t).matchAll(/\{\{(\d+)\}\}/g)) vars.add(m[1]);
    }
  }
  return [...vars].sort((a, b) => Number(a) - Number(b));
}

function renderTemplatePreview(template: WhatsAppTemplate, variables: Record<string, string>): string {
  const body = template.components?.find((c: any) => c.type === "BODY" || c.type === "body");
  if (!body?.text) return "";
  return String(body.text).replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const v = variables[n];
    if (!v) return `{{${n}}}`;
    if (v === "$CONTACT_NAME") return "Customer Name";
    if (v === "$CONTACT_FIRST_NAME") return "First Name";
    if (v === "$AGENT_USERNAME") return "Agent";
    return v;
  });
}

function statusBadge(status: BroadcastJob["status"]) {
  const cfg = {
    pending: {
      label: "Sending",
      cls: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
      Icon: Loader2,
    },
    completed: {
      label: "Completed",
      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
      Icon: CheckCircle2,
    },
    partial: {
      label: "Partial",
      cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400",
      Icon: AlertTriangle,
    },
    failed: {
      label: "Failed",
      cls: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
      Icon: XCircle,
    },
  } as const;
  const c = cfg[status] ?? cfg.failed;
  const Icon = c.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.cls}`}>
      <Icon className={`h-3 w-3 ${status === "pending" ? "animate-spin" : ""}`} />
      {c.label}
    </span>
  );
}

function WhatsAppBubblePreview({
  template,
  variables,
}: {
  template: WhatsAppTemplate;
  variables: Record<string, string>;
}) {
  const preview = renderTemplatePreview(template, variables);
  const header = template.components?.find((c: any) => c.type === "HEADER" || c.type === "header");
  const footer = template.components?.find((c: any) => c.type === "FOOTER" || c.type === "footer");
  const buttons = template.components?.find((c: any) => c.type === "BUTTONS" || c.type === "buttons");

  return (
    <div className="rounded-xl bg-[#efeae2] p-4 dark:bg-[#0b141a]">
      <div className="max-w-[280px]">
        <div className="overflow-hidden rounded-lg rounded-tl-none bg-white shadow-sm dark:bg-[#202c33]">
          {header?.text && (
            <p className="px-3 pt-2 text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">{header.text}</p>
          )}
          <p className="whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-[#111b21] dark:text-[#e9edef]">
            {preview || <span className="italic opacity-50">Fill variables to preview…</span>}
          </p>
          <div className="flex items-end justify-between gap-2 px-3 pb-2">
            {footer?.text ? (
              <span className="text-xs text-[#667781] dark:text-[#8696a0]">{footer.text}</span>
            ) : (
              <span />
            )}
            <span className="text-[10px] text-[#667781] dark:text-[#8696a0]">12:00</span>
          </div>
        </div>
        {buttons?.buttons?.length > 0 && (
          <div className="mt-1 space-y-1">
            {buttons.buttons.map((b: any, i: number) => (
              <div
                key={i}
                className="rounded-lg bg-white px-3 py-2 text-center text-sm font-medium text-[#00a884] dark:bg-[#202c33]"
              >
                {b.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryJobRow({ job }: { job: BroadcastJob }) {
  const [expanded, setExpanded] = useState(false);
  const deliveredCount = job.recipients.filter(
    (r) => r.status === "delivered" || r.deliveredAt || r.readAt,
  ).length;
  const readCount = job.recipients.filter((r) => r.readAt).length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/30"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex min-w-0 items-center gap-4">
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
              {new Date(job.createdAt).toLocaleString()} · {job.total} recipient
              {job.total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          {statusBadge(job.status)}
          <div className="hidden items-center gap-4 border-l border-border pl-4 sm:flex">
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {job.succeeded}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {deliveredCount}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Dlvrd</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                {readCount}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Read</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">{job.failed}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Fail</span>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="max-h-64 divide-y divide-border overflow-y-auto border-t border-border">
          {job.recipients.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              {job.status === "pending" ? "Recipients updating as messages send…" : "No recipient details"}
            </p>
          ) : (
            job.recipients.map((r) => {
              const isDelivered = r.status === "delivered" || !!r.deliveredAt;
              const isRead = !!r.readAt;
              return (
                <div key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      r.status === "failed"
                        ? "bg-red-500"
                        : isRead
                          ? "bg-violet-500"
                          : isDelivered
                            ? "bg-blue-500"
                            : "bg-emerald-500"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.customerName || r.customerId}</span>
                  {r.error && (
                    <span className="max-w-[180px] truncate text-xs text-red-500" title={r.error}>
                      {r.error}
                    </span>
                  )}
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
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
            })
          )}
        </div>
      )}
    </div>
  );
}

const STEPS = [
  { id: 1, label: "Template", Icon: FileText },
  { id: 2, label: "Recipients", Icon: Users },
  { id: 3, label: "Review", Icon: Eye },
] as const;

export function BroadcastPage() {
  const { data: accounts } = useAccounts();
  const accountId = accounts?.[0]?.id ?? "";

  const { data: featureFlag, isLoading: flagLoading } = useFeatureFlag("broadcast_enabled");
  const { enabledChannels, channelsReady } = useEnabledChannelTypes();
  const hasWhatsApp = enabledChannels.includes("whatsapp");

  const { data: templates = [], isLoading: templatesLoading } = useWhatsAppTemplates();
  const { data: contacts = [], isLoading: contactsLoading } = useContacts(accountId);
  const { data: broadcastJobs = [], isLoading: jobsLoading } = useBroadcasts();
  const { data: allTags = [] } = useContactTags();
  const sendBroadcast = useSendBroadcast();

  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [step, setStep] = useState(1);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const templateDropRef = useRef<HTMLDivElement>(null);

  const [variables, setVariables] = useState<Record<string, string>>({});
  const [tagFilter, setTagFilter] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState<string>("ALL");

  useEffect(() => {
    if (!templateDropdownOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (templateDropRef.current && !templateDropRef.current.contains(e.target as Node)) {
        setTemplateDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [templateDropdownOpen]);

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
          (c.whatsappId ?? "").includes(q) ||
          (c.whatsappIds ?? []).some((id) => id.includes(q)),
      );
    }
    return list;
  }, [waContacts, tagFilter, contactSearch]);

  const allVisible =
    filteredContacts.length > 0 && filteredContacts.every((c) => selectedContactIds.has(c.id));

  const varsReady = templateVars.every((v) => Boolean(variables[v]?.trim()));
  const canGoRecipients = Boolean(selectedTemplateId) && varsReady;
  const canGoReview = canGoRecipients && selectedContactIds.size > 0;
  const canSend = canGoReview && !sendBroadcast.isPending;

  const filteredHistory = useMemo(() => {
    return broadcastJobs.filter((j) => {
      if (historyStatus !== "ALL" && j.status !== historyStatus) return false;
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      return j.templateName.toLowerCase().includes(q);
    });
  }, [broadcastJobs, historySearch, historyStatus]);

  const historyStats = useMemo(() => {
    const total = broadcastJobs.length;
    const sent = broadcastJobs.reduce((a, j) => a + j.succeeded, 0);
    const failed = broadcastJobs.reduce((a, j) => a + j.failed, 0);
    const pending = broadcastJobs.filter((j) => j.status === "pending").length;
    return { total, sent, failed, pending };
  }, [broadcastJobs]);

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (allVisible) filteredContacts.forEach((c) => next.delete(c.id));
      else filteredContacts.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const selectTemplate = (t: WhatsAppTemplate) => {
    setSelectedTemplateId(t.id);
    const vars = extractTemplateVariables(t);
    const initial: Record<string, string> = {};
    // Most re-engagement templates use {{1}} as the customer name
    if (vars.includes("1")) initial["1"] = "$CONTACT_FIRST_NAME";
    setVariables(initial);
    setTemplateDropdownOpen(false);
    setTemplateSearch("");
  };

  const handleSend = async () => {
    if (!selectedTemplateId || selectedContactIds.size === 0) return;
    try {
      const res = await sendBroadcast.mutateAsync({
        templateId: selectedTemplateId,
        customerIds: [...selectedContactIds],
        variables,
        ...(tagFilter ? { tag: tagFilter } : {}),
      });
      setConfirmOpen(false);
      setSelectedContactIds(new Set());
      setStep(1);
      setActiveTab("history");
      toast.success(
        res.status === "pending"
          ? `Broadcast queued for ${res.total} contacts`
          : `Broadcast finished: ${res.succeeded}/${res.total} sent`,
      );
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
    setStep(1);
  };

  if (flagLoading || !channelsReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!featureFlag?.enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">Broadcasting is disabled</h2>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Ask an admin to enable <code className="rounded bg-muted px-1.5 py-0.5 text-xs">broadcast_enabled</code>{" "}
          in the admin panel.
        </p>
      </div>
    );
  }

  if (!hasWhatsApp) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Radio className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">WhatsApp not connected</h2>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Connect WhatsApp in Settings before sending broadcasts.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <ConfirmDialog
        open={confirmOpen}
        title="Send broadcast?"
        description={
          <>
            Send <strong>{selectedTemplate?.name}</strong> to{" "}
            <strong>{selectedContactIds.size}</strong> contact
            {selectedContactIds.size !== 1 ? "s" : ""}. Meta template messaging charges may apply.
          </>
        }
        confirmLabel={sendBroadcast.isPending ? "Sending…" : "Send now"}
        confirming={sendBroadcast.isPending}
        onConfirm={handleSend}
        onCancel={() => setConfirmOpen(false)}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden px-6 pt-8 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Broadcast</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Send an approved WhatsApp template to many contacts at once.
            </p>
          </div>
          <div className="flex rounded-xl bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("new")}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                activeTab === "new"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              New
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                activeTab === "history"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              History
              {broadcastJobs.length > 0 && (
                <span className="ml-0.5 text-xs opacity-60">{broadcastJobs.length}</span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto pb-8">
          {activeTab === "new" && (
            <div className="space-y-6">
              {/* Stepper */}
              <div className="flex items-center gap-2">
                {STEPS.map((s, i) => {
                  const done =
                    (s.id === 1 && canGoRecipients) ||
                    (s.id === 2 && canGoReview) ||
                    (s.id === 3 && canSend);
                  const active = step === s.id;
                  return (
                    <div key={s.id} className="flex flex-1 items-center gap-2">
                      <button
                        type="button"
                        disabled={s.id === 2 && !canGoRecipients}
                        onClick={() => {
                          if (s.id === 1) setStep(1);
                          else if (s.id === 2 && canGoRecipients) setStep(2);
                          else if (s.id === 3 && canGoReview) setStep(3);
                        }}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : done
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "border-border text-muted-foreground"
                        } disabled:opacity-40`}
                      >
                        <s.Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{s.label}</span>
                        <span className="sm:hidden">{s.id}</span>
                      </button>
                      {i < STEPS.length - 1 && (
                        <div className={`h-px flex-1 ${done ? "bg-emerald-500/40" : "bg-border"}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  {/* Step 1 */}
                  {step === 1 && (
                    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                      <h2 className="mb-1 text-base font-semibold">Choose template</h2>
                      <p className="mb-4 text-sm text-muted-foreground">
                        Only Meta-approved templates can be broadcast.
                      </p>

                      {templatesLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : approvedTemplates.length === 0 ? (
                        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                          No approved templates yet. Create one on the Templates page and wait for Meta approval.
                        </p>
                      ) : (
                        <div ref={templateDropRef} className="relative">
                          <button
                            type="button"
                            onClick={() => setTemplateDropdownOpen((p) => !p)}
                            className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm transition-colors hover:bg-muted/40"
                          >
                            <span
                              className={
                                selectedTemplate ? "font-medium text-foreground" : "text-muted-foreground"
                              }
                            >
                              {selectedTemplate
                                ? `${selectedTemplate.name} · ${selectedTemplate.language}`
                                : "Select an approved template…"}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 text-muted-foreground transition-transform ${
                                templateDropdownOpen ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                          <AnimatePresence>
                            {templateDropdownOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl"
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
                                      className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                  </div>
                                </div>
                                <div className="max-h-56 overflow-y-auto">
                                  {filteredTemplates.length === 0 ? (
                                    <p className="px-4 py-4 text-center text-sm text-muted-foreground">
                                      No match
                                    </p>
                                  ) : (
                                    filteredTemplates.map((t) => (
                                      <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => selectTemplate(t)}
                                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50 ${
                                          t.id === selectedTemplateId
                                            ? "bg-primary/5 font-medium text-primary"
                                            : ""
                                        }`}
                                      >
                                        <span className="truncate">{t.name}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                          {t.language}
                                        </span>
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
                          <p className="text-sm font-medium">Variables</p>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {templateVars.map((v) => (
                              <div key={v}>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                  {`{{${v}}}`}
                                </label>
                                <Input
                                  placeholder={`Value for {{${v}}}`}
                                  value={variables[v] ?? ""}
                                  onChange={(e) =>
                                    setVariables((p) => ({ ...p, [v]: e.target.value }))
                                  }
                                />
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {(
                                    [
                                      ["$CONTACT_FIRST_NAME", "First name"],
                                      ["$CONTACT_NAME", "Full name"],
                                      ["$AGENT_USERNAME", "Agent"],
                                    ] as const
                                  ).map(([token, label]) => (
                                    <button
                                      key={token}
                                      type="button"
                                      onClick={() => setVariables((p) => ({ ...p, [v]: token }))}
                                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                        variables[v] === token
                                          ? "border-primary bg-primary/10 text-primary"
                                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-6 flex justify-end gap-2">
                        <Button
                          onClick={() => setStep(2)}
                          disabled={!canGoRecipients}
                          className="gap-2"
                        >
                          Next: Recipients
                          <Users className="h-4 w-4" />
                        </Button>
                      </div>
                    </section>
                  )}

                  {/* Step 2 */}
                  {step === 2 && (
                    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold">Select recipients</h2>
                          <p className="text-sm text-muted-foreground">
                            Contacts with a WhatsApp number
                          </p>
                        </div>
                        {selectedContactIds.size > 0 && (
                          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                            {selectedContactIds.size} selected
                          </span>
                        )}
                      </div>

                      {contactsLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : waContacts.length === 0 ? (
                        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                          No contacts with a WhatsApp number. Add numbers in Contacts first.
                        </p>
                      ) : (
                        <>
                          {allTags.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setTagFilter("");
                                  setSelectedContactIds(new Set());
                                }}
                                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                  !tagFilter
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                All ({waContacts.length})
                              </button>
                              {allTags.map((t) => {
                                const count = waContacts.filter((c) => c.tag === t).length;
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => {
                                      setTagFilter(t === tagFilter ? "" : t);
                                      setSelectedContactIds(new Set());
                                    }}
                                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${
                                      tagFilter === t
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    <Tag className="h-2.5 w-2.5" />
                                    {t} ({count})
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div className="mb-3 flex gap-2">
                            <div className="relative flex-1">
                              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                className="pl-8"
                                placeholder="Search name or number…"
                                value={contactSearch}
                                onChange={(e) => setContactSearch(e.target.value)}
                              />
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                              {allVisible ? "Deselect" : "Select all"}
                            </Button>
                          </div>

                          <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                            {filteredContacts.length === 0 ? (
                              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                                No contacts match
                              </p>
                            ) : (
                              filteredContacts.map((c) => {
                                const selected = selectedContactIds.has(c.id);
                                const wa = c.whatsappIds?.[0] ?? c.whatsappId ?? "";
                                return (
                                  <label
                                    key={c.id}
                                    className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/30 ${
                                      selected ? "bg-primary/5" : ""
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded accent-primary"
                                      checked={selected}
                                      onChange={() => toggleContact(c.id)}
                                    />
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                      {c.name
                                        ? c.name
                                            .split(" ")
                                            .map((n) => n[0])
                                            .join("")
                                            .slice(0, 2)
                                            .toUpperCase()
                                        : "?"}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-medium">{c.name || "—"}</p>
                                        {c.tag && (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                            <Tag className="h-2 w-2" />
                                            {c.tag}
                                          </span>
                                        )}
                                      </div>
                                      <p className="truncate text-xs text-muted-foreground">{wa}</p>
                                    </div>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </>
                      )}

                      <div className="mt-6 flex justify-between gap-2">
                        <Button variant="outline" onClick={() => setStep(1)}>
                          Back
                        </Button>
                        <Button onClick={() => setStep(3)} disabled={!canGoReview} className="gap-2">
                          Next: Review
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </section>
                  )}

                  {/* Step 3 */}
                  {step === 3 && (
                    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                      <h2 className="mb-1 text-base font-semibold">Review & send</h2>
                      <p className="mb-5 text-sm text-muted-foreground">
                        Confirm details before sending to Meta.
                      </p>

                      <dl className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Template</dt>
                          <dd className="font-medium text-right">{selectedTemplate?.name}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Language</dt>
                          <dd className="font-medium">{selectedTemplate?.language}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Recipients</dt>
                          <dd className="font-medium">{selectedContactIds.size}</dd>
                        </div>
                        {tagFilter && (
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted-foreground">Tag filter</dt>
                            <dd className="font-medium">{tagFilter}</dd>
                          </div>
                        )}
                        {templateVars.length > 0 && (
                          <div className="border-t border-border pt-3">
                            <dt className="mb-2 text-muted-foreground">Variables</dt>
                            <dd className="space-y-1">
                              {templateVars.map((v) => (
                                <div key={v} className="flex justify-between gap-2 font-mono text-xs">
                                  <span className="text-muted-foreground">{`{{${v}}}`}</span>
                                  <span>
                                    {variables[v] === "$CONTACT_FIRST_NAME"
                                      ? "First name (per contact)"
                                      : variables[v] === "$CONTACT_NAME"
                                        ? "Full name (per contact)"
                                        : variables[v] === "$AGENT_USERNAME"
                                          ? "Agent username"
                                          : variables[v]}
                                  </span>
                                </div>
                              ))}
                            </dd>
                          </div>
                        )}
                      </dl>

                      <div className="mt-6 flex flex-wrap justify-between gap-2">
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => setStep(2)}>
                            Back
                          </Button>
                          <Button variant="ghost" onClick={resetForm}>
                            Reset
                          </Button>
                        </div>
                        <Button
                          className="gap-2"
                          disabled={!canSend}
                          onClick={() => setConfirmOpen(true)}
                        >
                          <Send className="h-4 w-4" />
                          Send to {selectedContactIds.size} contact
                          {selectedContactIds.size !== 1 ? "s" : ""}
                        </Button>
                      </div>
                    </section>
                  )}
                </div>

                {/* Sticky preview */}
                <aside className="hidden lg:block">
                  <div className="sticky top-0 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Preview
                    </p>
                    {selectedTemplate ? (
                      <WhatsAppBubblePreview template={selectedTemplate} variables={variables} />
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                        Select a template to preview
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Auto tokens like First name are filled per contact when sending.
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-5">
              {!jobsLoading && broadcastJobs.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Campaigns", value: historyStats.total, Icon: Radio },
                    { label: "Messages sent", value: historyStats.sent, Icon: CheckCircle2 },
                    { label: "Failed", value: historyStats.failed, Icon: XCircle },
                    { label: "In progress", value: historyStats.pending, Icon: Clock },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <s.Icon className="h-3.5 w-3.5" />
                        <span className="text-xs">{s.label}</span>
                      </div>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {broadcastJobs.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search by template name…"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["ALL", "pending", "completed", "partial", "failed"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setHistoryStatus(s)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                          historyStatus === s
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s === "ALL" ? "All" : s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {jobsLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : broadcastJobs.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                    <BarChart3 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold">No broadcasts yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Send your first campaign from the New tab.
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setActiveTab("new")} className="gap-2">
                    <Send className="h-4 w-4" />
                    New broadcast
                  </Button>
                </div>
              ) : filteredHistory.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No broadcasts match your filters.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredHistory.map((job) => (
                    <HistoryJobRow key={job.id} job={job} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
