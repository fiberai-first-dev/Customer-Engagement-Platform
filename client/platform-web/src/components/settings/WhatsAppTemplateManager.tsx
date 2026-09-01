import { useState, useMemo, useEffect } from "react";
import {
  useWhatsAppTemplates,
  useSyncTemplates,
  type WhatsAppTemplate,
} from "../../api";
import { Button } from "../ui/button";
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  PauseCircle,
  MinusCircle,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { WhatsAppTemplateCreateModal } from "./WhatsAppTemplateCreateModal";
import { WhatsAppTemplateDetailDrawer } from "./WhatsAppTemplateDetailDrawer";
import { motion, AnimatePresence } from "framer-motion";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CFG = {
  APPROVED: {
    label: "Approved",
    Icon: CheckCircle2,
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  PENDING: {
    label: "Pending",
    Icon: Clock,
    cls: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20",
  },
  REJECTED: {
    label: "Rejected",
    Icon: XCircle,
    cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  },
  PAUSED: {
    label: "Paused",
    Icon: PauseCircle,
    cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
  },
  DISABLED: {
    label: "Disabled",
    Icon: MinusCircle,
    cls: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20",
  },
  UNKNOWN: {
    label: "Unknown",
    Icon: AlertTriangle,
    cls: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20",
  },
} as const;

function StatusBadge({ status }: { status: WhatsAppTemplate["status"] }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.UNKNOWN;
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${cfg.cls}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  CUSTOMER_REENGAGEMENT: "Re-engagement",
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
  OTHER: "Other",
};

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

/** Return body text with Meta example values substituted for {{n}} placeholders */
function getBodyPreviewWithExamples(components: any[]): string {
  const bodyComp = components?.find(
    (c: any) => c.type === "BODY" || c.type === "body"
  );
  if (!bodyComp?.text) return "";
  const text: string = bodyComp.text;
  const exRows: string[][] = bodyComp.example?.body_text ?? [];
  const examples: string[] = exRows[0] ?? [];
  if (!examples.length) return text;
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const ex = examples[parseInt(n) - 1];
    return ex ? ex : `{{${n}}}`;
  });
}

// ─── Table row skeleton ───────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-muted animate-pulse rounded" style={{ width: `${40 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
  filtered,
  onNew,
  onSync,
  isSyncing,
}: {
  filtered: boolean;
  onNew: () => void;
  onSync: () => void;
  isSyncing: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
        <RefreshCw className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="text-base font-semibold">
          {filtered ? "No templates match your filters" : "No templates yet"}
        </p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          {filtered
            ? "Try changing your search or filters."
            : "Sync from Meta to import existing templates, or create a new one in CEP."}
        </p>
      </div>
      {!filtered && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing} className="gap-2">
            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync from Meta
          </Button>
          <Button size="sm" onClick={onNew} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            New Template
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WhatsAppTemplateManager() {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const { mutate: syncTemplates, isPending: isSyncing } = useSyncTemplates();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [prefillTemplate, setPrefillTemplate] = useState<WhatsAppTemplate | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Auto-sync on mount
  useEffect(() => {
    syncTemplates(undefined, {
      onError: (err: any) => {
        if (
          !err.message?.includes("not configured") &&
          !err.message?.includes("disabled")
        ) {
          toast.error(err.message ?? "Sync failed");
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = () => {
    syncTemplates(undefined, {
      onSuccess: () => toast.success("Templates synced from Meta"),
      onError: (err: any) => toast.error(err.message ?? "Sync failed"),
    });
  };

  const handleDuplicate = (template: WhatsAppTemplate) => {
    const body = template.components?.find(
      (c: any) => c.type === "BODY" || c.type === "body"
    )?.text ?? "";
    const footer = template.components?.find(
      (c: any) => c.type === "FOOTER" || c.type === "footer"
    )?.text ?? "";
    const header = template.components?.find(
      (c: any) => c.type === "HEADER" || c.type === "header"
    );
    const buttons = template.components?.find(
      (c: any) => c.type === "BUTTONS" || c.type === "buttons"
    )?.buttons ?? [];

    setPrefillTemplate({
      ...template,
      name: template.name + "_v2",
      body,
      footer,
      headerType: header?.format ?? "NONE",
      headerContent: header?.text ?? "",
      buttons,
    } as any);
    setSelectedTemplate(null);
    setCreateOpen(true);
  };

  // Derived filter options
  const allCategories = useMemo(
    () => [...new Set(templates.map((t: WhatsAppTemplate) => t.internalCategory))],
    [templates]
  );

  // Filtered templates
  const filtered = useMemo(() => {
    return templates.filter((t: WhatsAppTemplate) => {
      const matchSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.language.toLowerCase().includes(search.toLowerCase()) ||
        t.metaCategory.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "ALL" || t.status === statusFilter;
      const matchCategory =
        categoryFilter === "ALL" || t.internalCategory === categoryFilter;
      return matchSearch && matchStatus && matchCategory;
    });
  }, [templates, search, statusFilter, categoryFilter]);

  const statusCounts = useMemo(() => {
    return templates.reduce(
      (acc: Record<string, number>, t: WhatsAppTemplate) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      },
      {}
    );
  }, [templates]);

  return (
    <div className="space-y-6">
      {/* Status summary chips */}
      {!isLoading && templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusCounts).map(([status, count]) => {
            const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.UNKNOWN;
            const Icon = cfg.Icon;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? "ALL" : status)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  statusFilter === status
                    ? cfg.cls + " ring-2 ring-offset-1 ring-current"
                    : cfg.cls + " opacity-60 hover:opacity-100"
                }`}
              >
                <Icon className="h-3 w-3" />
                {cfg.label}
                <span className="ml-0.5 opacity-80">{count}</span>
              </button>
            );
          })}
          {statusFilter !== "ALL" && (
            <button
              onClick={() => setStatusFilter("ALL")}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Top bar: search + filters + actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search templates…"
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Category filter */}
        {allCategories.length > 1 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm bg-muted/50 border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer shrink-0"
          >
            <option value="ALL">All categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="gap-2"
          >
            {isSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isSyncing ? "Syncing…" : "Sync from Meta"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setPrefillTemplate(null);
              setCreateOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            New Template
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  {["Name", "Internal Category", "Meta Category", "Language", "Status", "Last Synced", "Actions"].map(
                    (h) => (
                      <th key={h} className="px-6 py-3.5 font-medium text-muted-foreground whitespace-nowrap">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            filtered={search !== "" || statusFilter !== "ALL" || categoryFilter !== "ALL"}
            onNew={() => setCreateOpen(true)}
            onSync={handleSync}
            isSyncing={isSyncing}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {["Name", "Internal Category", "Meta Category", "Language", "Status", "Last Synced", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-6 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {filtered.map((template: WhatsAppTemplate) => (
                    <motion.tr
                      key={template.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      {/* Name */}
                      <td className="px-6 py-4">
                        <div>
                          <button
                            onClick={() => setSelectedTemplate(template)}
                            className="font-semibold font-mono text-sm hover:text-primary transition-colors text-left"
                          >
                            {template.name}
                          </button>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 max-w-[200px]" title={getBodyPreviewWithExamples(template.components)}>
                            {getBodyPreviewWithExamples(template.components)}
                          </p>
                        </div>
                      </td>

                      {/* Internal Category */}
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                        {CATEGORY_LABELS[template.internalCategory] ?? template.internalCategory}
                      </td>

                      {/* Meta Category */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md font-medium">
                          {template.metaCategory}
                        </span>
                      </td>

                      {/* Language */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-md font-medium ring-1 ring-inset ring-secondary-foreground/10">
                          {template.language}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={template.status} />
                        {template.status === "REJECTED" && template.rejectionReason && (
                          <p
                            className="text-xs text-red-500 mt-1 max-w-[150px] truncate"
                            title={template.rejectionReason}
                          >
                            {template.rejectionReason}
                          </p>
                        )}
                      </td>

                      {/* Last Synced */}
                      <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(template.lastSyncedAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all"
                          onClick={() => setSelectedTemplate(template)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <WhatsAppTemplateCreateModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setPrefillTemplate(null);
        }}
        prefill={
          prefillTemplate
            ? {
                name: (prefillTemplate as any).name,
                language: prefillTemplate.language,
                internalCategory: prefillTemplate.internalCategory,
                metaCategory: prefillTemplate.metaCategory,
                body: (prefillTemplate as any).body,
                footer: (prefillTemplate as any).footer,
                headerType: (prefillTemplate as any).headerType,
                headerContent: (prefillTemplate as any).headerContent,
                buttons: (prefillTemplate as any).buttons,
              }
            : undefined
        }
      />

      {/* Detail Drawer */}
      <WhatsAppTemplateDetailDrawer
        template={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        onDuplicate={handleDuplicate}
        onDeleted={() => setSelectedTemplate(null)}
      />
    </div>
  );
}
