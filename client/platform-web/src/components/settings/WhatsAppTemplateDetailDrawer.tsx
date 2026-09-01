import {
  X,
  RefreshCw,
  Trash2,
  Copy,
  ExternalLink,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  XCircle,
  MinusCircle,
  Send,
  CheckCheck,
  Eye as EyeIcon,
  MessageSquare,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  type WhatsAppTemplate,
  useSyncSingleTemplate,
  useDeleteTemplate,
  useTemplateAnalytics,
} from "../../api";
import { toast } from "sonner";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmDialog } from "../ui/confirm-dialog";



function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getBodyText(components: any[]): string {
  return (
    components?.find((c: any) => c.type === "BODY" || c.type === "body")?.text ?? ""
  );
}

function getHeader(components: any[]): { format: string; text?: string } | null {
  const h = components?.find((c: any) => c.type === "HEADER" || c.type === "header");
  if (!h) return null;
  return { format: h.format, text: h.text };
}

function getFooter(components: any[]): string | null {
  return (
    components?.find((c: any) => c.type === "FOOTER" || c.type === "footer")?.text ?? null
  );
}

function getButtons(components: any[]): any[] {
  return (
    components?.find((c: any) => c.type === "BUTTONS" || c.type === "buttons")
      ?.buttons ?? []
  );
}

function applyPlaceholders(text: string): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => `[param ${n}]`);
}

/** Extract example values from Meta's component.example structure */
function applyComponentExamples(comp: any): string {
  if (!comp?.text) return comp?.text ?? "";
  const exHeader: string[] = comp.example?.header_text ?? [];
  const exBody: string[][] = comp.example?.body_text ?? [];
  const examples: string[] = exHeader.length ? exHeader : (exBody[0] ?? []);
  let text: string = comp.text;
  examples.forEach((ex, i) => {
    text = text.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), ex);
  });
  return text;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  PENDING: {
    label: "Pending",
    icon: Clock,
    cls: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20",
  },
  REJECTED: {
    label: "Rejected",
    icon: XCircle,
    cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  },
  PAUSED: {
    label: "Paused",
    icon: PauseCircle,
    cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
  },
  DISABLED: {
    label: "Disabled",
    icon: MinusCircle,
    cls: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20",
  },
  UNKNOWN: {
    label: "Unknown",
    icon: AlertTriangle,
    cls: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20",
  },
};

function StatusBadge({ status }: { status: WhatsAppTemplate["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.UNKNOWN;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${cfg.cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

// ─── Analytics Section ────────────────────────────────────────────────────────

function AnalyticsStat({
  label,
  value,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/20 px-4 py-3">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {loading ? (
        <div className="h-6 w-12 bg-muted animate-pulse rounded mt-1" />
      ) : (
        <p className="text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
      )}
    </div>
  );
}

function AnalyticsSection({
  templateId,
}: {
  templateId: string;
}) {
  const { data: analytics, isLoading } = useTemplateAnalytics(templateId);

  const deliveryRate =
    analytics && analytics.sent > 0
      ? Math.round((analytics.delivered / analytics.sent) * 100)
      : null;
  const readRate =
    analytics && analytics.delivered > 0
      ? Math.round((analytics.read / analytics.delivered) * 100)
      : null;

  return (
    <div className="px-6 py-4 border-b border-border/60">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
          Analytics · Last 30 days
        </p>
        {analytics?.period?.start && (
          <span className="text-[10px] text-muted-foreground">
            {fmtDate(analytics.period.start)} – {fmtDate(analytics.period.end)}
          </span>
        )}
      </div>

      {/* CEP usage count — always available */}
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        <span>
          Sent from inbox:{" "}
          <span className="font-semibold text-foreground">
            {isLoading ? "…" : (analytics?.usageCount ?? 0).toLocaleString()}
          </span>{" "}
          time{(analytics?.usageCount ?? 0) !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Meta analytics stats */}
      {analytics?.available === false && analytics?.message ? (
        <div className="rounded-xl border border-border bg-muted/10 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-500" />
          <span>{analytics.message}</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <AnalyticsStat
            label="Sent"
            value={analytics?.sent ?? 0}
            icon={Send}
            color="text-blue-500"
            loading={isLoading}
          />
          <AnalyticsStat
            label="Delivered"
            value={analytics?.delivered ?? 0}
            icon={CheckCheck}
            color="text-emerald-500"
            loading={isLoading}
          />
          <AnalyticsStat
            label="Read"
            value={analytics?.read ?? 0}
            icon={EyeIcon}
            color="text-purple-500"
            loading={isLoading}
          />
        </div>
      )}

      {/* Delivery / read rates */}
      {!isLoading && analytics?.available && analytics.sent > 0 && (
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          {deliveryRate !== null && (
            <span>
              Delivery rate:{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {deliveryRate}%
              </span>
            </span>
          )}
          {readRate !== null && (
            <span>
              Read rate:{" "}
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                {readRate}%
              </span>
            </span>
          )}
        </div>
      )}

      {!isLoading && analytics?.available && analytics.message && (
        <p className="mt-2 text-xs text-muted-foreground italic">{analytics.message}</p>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  template: WhatsAppTemplate | null;
  onClose: () => void;
  onDuplicate: (template: WhatsAppTemplate) => void;
  onDeleted: () => void;
}

export function WhatsAppTemplateDetailDrawer({
  template,
  onClose,
  onDuplicate,
  onDeleted,
}: Props) {
  const { mutateAsync: syncTemplate, isPending: isSyncing } = useSyncSingleTemplate();
  const { mutateAsync: deleteTemplate, isPending: isDeleting } = useDeleteTemplate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSync = async () => {
    if (!template) return;
    try {
      await syncTemplate(template.id);
      toast.success("Template status refreshed");
    } catch (err: any) {
      toast.error(err.message || "Failed to sync template");
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    try {
      await deleteTemplate(template.id);
      toast.success(`Template "${template.name}" deleted`);
      setShowDeleteConfirm(false);
      onDeleted();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete template");
      setShowDeleteConfirm(false);
    }
  };

  const header = template ? getHeader(template.components) : null;
  const body = template ? getBodyText(template.components) : "";
  const footer = template ? getFooter(template.components) : null;
  const buttons = template ? getButtons(template.components) : [];

  // Body with example values filled in
  const bodyWithExamples = template
    ? applyComponentExamples(
        template.components?.find(
          (c: any) => c.type === "BODY" || c.type === "body"
        )
      )
    : "";

  return (
    <>
      <AnimatePresence>
        {template && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
            />

            {/* Drawer */}
            <motion.div
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="fixed right-0 top-0 h-full z-50 w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0">
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold tracking-tight font-mono text-foreground truncate">
                      {template.name}
                    </h2>
                    <StatusBadge status={template.status} />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {template.metaCategory}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {template.language}
                    </span>
                    {template.qualityScore && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Quality: {template.qualityScore}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto">
                {/* Meta info */}
                <div className="px-6 py-3 text-xs text-muted-foreground border-b border-border/60 space-y-1 bg-muted/10">
                  <div className="flex items-center gap-4 flex-wrap">
                    {template.metaTemplateId && (
                      <span>
                        Meta ID:{" "}
                        <code className="font-mono text-foreground/80">
                          {template.metaTemplateId}
                        </code>
                      </span>
                    )}
                    {template.wabaId && (
                      <span>
                        WABA:{" "}
                        <code className="font-mono text-foreground/80">
                          {template.wabaId}
                        </code>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last synced: {formatRelativeTime(template.lastSyncedAt)}
                  </div>
                  <div>
                    Internal category:{" "}
                    <span className="text-foreground/80">{template.internalCategory}</span>
                  </div>
                </div>

                {/* Rejection reason */}
                {template.status === "REJECTED" && template.rejectionReason && (
                  <div className="mx-6 my-4 p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                        Rejection reason
                      </p>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
                      {template.rejectionReason}
                    </p>
                  </div>
                )}

                {/* Approved-cannot-edit notice */}
                {template.status === "APPROVED" && (
                  <div className="mx-6 my-4 p-3 rounded-xl border border-blue-200 bg-blue-50/60 dark:bg-blue-500/10 dark:border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    Approved templates cannot be edited. Use{" "}
                    <strong>Duplicate</strong> to create a new version.
                  </div>
                )}

                {/* Analytics */}
                <AnalyticsSection templateId={template.id} />

                {/* Preview */}
                <div className="px-6 py-4 border-b border-border/60">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                    Preview
                  </p>
                  <div
                    className="rounded-xl p-4"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,.015) 10px, rgba(0,0,0,.015) 20px)",
                    }}
                  >
                    <div className="max-w-[260px] space-y-0.5">
                      {header && (
                        <div className="bg-[#E7FFDB] dark:bg-[#005C4B] rounded-t-2xl rounded-br-2xl px-3 pt-2.5 pb-1.5">
                          {header.format === "TEXT" ? (
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">
                              {applyPlaceholders(header.text ?? "")}
                            </p>
                          ) : (
                            <div className="h-16 bg-black/10 rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                              {header.format} media
                            </div>
                          )}
                        </div>
                      )}
                      {body && (
                        <div
                          className={`bg-[#E7FFDB] dark:bg-[#005C4B] px-3 py-2.5 text-sm text-gray-800 dark:text-white whitespace-pre-wrap leading-snug ${
                            !header ? "rounded-t-2xl" : ""
                          } ${
                            !footer && !buttons.length
                              ? "rounded-b-2xl rounded-br-none"
                              : ""
                          }`}
                        >
                          {bodyWithExamples || applyPlaceholders(body)}
                        </div>
                      )}
                      {footer && (
                        <div className="bg-[#E7FFDB] dark:bg-[#005C4B] px-3 pb-2 text-xs text-gray-500 dark:text-gray-400">
                          {footer}
                        </div>
                      )}
                      {buttons.map((btn: any, i: number) => (
                        <div
                          key={i}
                          className="bg-white dark:bg-[#1f2c34] border border-[#d1f4cc] dark:border-[#005C4B]/60 rounded-xl px-3 py-2 text-center text-xs font-semibold text-primary"
                        >
                          {btn.text}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Components breakdown */}
                <div className="px-6 py-4 border-b border-border/60">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                    Components
                  </p>
                  <div className="space-y-2">
                    {template.components.map((comp: any, i: number) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide w-16 shrink-0 pt-0.5">
                          {comp.type}
                        </span>
                        <div className="text-foreground/80 leading-relaxed min-w-0">
                          {comp.type === "BUTTONS"
                            ? comp.buttons
                                ?.map(
                                  (b: any) =>
                                    `${b.type} — "${b.text}"${b.url ? ` → ${b.url}` : ""}`
                                )
                                .join(" · ")
                            : comp.format
                            ? `${comp.format}${comp.text ? ` — "${comp.text}"` : ""}`
                            : comp.text || JSON.stringify(comp)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div className="border-t border-border px-6 py-4 bg-muted/20 flex items-center gap-2 flex-wrap shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="gap-1.5"
                >
                  {isSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh status
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDuplicate(template)}
                  className="gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </Button>
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <a
                    href="https://business.facebook.com/wa/manage/message-templates/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Meta Manager
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Template?"
        description={
          <>
            Are you sure you want to delete{" "}
            <strong>{template?.name}</strong>? This will remove it from Meta
            and from CEP. This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        confirming={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
