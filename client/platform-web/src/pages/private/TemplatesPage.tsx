import { WhatsAppTemplateManager } from "../../components/settings/WhatsAppTemplateManager";

export function TemplatesPage() {
  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8 pb-16 sm:px-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage message templates for conversations outside the 24-hour window.
          </p>
        </div>
        <WhatsAppTemplateManager />
      </div>
    </div>
  );
}
