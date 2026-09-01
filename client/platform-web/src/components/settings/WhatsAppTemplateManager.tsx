import { useState, useEffect } from "react";
import { useWhatsAppTemplates, useSyncTemplates, useDeleteTemplate, type WhatsAppTemplate } from "../../api";
import { Button } from "../ui/button";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "../ui/confirm-dialog";

export function WhatsAppTemplateManager() {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const { mutate: syncTemplates, isPending: isSyncing } = useSyncTemplates();
  const { mutateAsync: deleteTemplate, isPending: isDeleting } = useDeleteTemplate();
  
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppTemplate | null>(null);

  useEffect(() => {
    syncTemplates(undefined, {
      onError: (err: any) => {
        // Only show error if it's not a generic unconfigured error
        if (!err.message?.includes("not configured")) {
          toast.error(err.message);
        }
      }
    });
  }, [syncTemplates]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate(deleteTarget.id);
      toast.success("Template deleted");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {/* Header removed as it is rendered by the parent page */}
        </div>
        <div className="flex items-center gap-2">
          {isSyncing && (
            <span className="text-xs text-muted-foreground flex items-center mr-2">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Syncing...
            </span>
          )}
          <Button size="sm" asChild>
            <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer">
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </a>
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <RefreshCw className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No templates found</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Create a new template in Meta's Business Manager. We'll automatically sync it when you return to this page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground">Language</th>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground">Category</th>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-6 py-3.5 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map((template: WhatsAppTemplate) => (
                  <tr key={template.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{template.name}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground ring-1 ring-inset ring-secondary-foreground/10">
                        {template.language}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{template.metaCategory}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          template.status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                            : template.status === "REJECTED"
                            ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20"
                            : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20"
                        }`}
                      >
                        {template.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => setDeleteTarget(template)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Template?"
        description={
          <>
            Are you sure you want to delete the template <strong>{deleteTarget?.name}</strong>?
            This removes it from Meta and from CEP.
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        confirming={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
