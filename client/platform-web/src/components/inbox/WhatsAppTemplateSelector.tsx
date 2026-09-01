import { useState, useMemo } from "react";
import { MessageSquareText, Search, X, Send, ChevronLeft, CheckCircle2 } from "lucide-react";
import { useWhatsAppTemplates, type WhatsAppTemplate } from "../../api";
import { Button } from "../ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "./utils";

interface Props {
  onSelect: (template: WhatsAppTemplate, variables: Record<string, string>) => void;
  disabled?: boolean;
}

export function WhatsAppTemplateSelector({ onSelect, disabled }: Props) {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  const approvedTemplates = useMemo(() => {
    return templates
      .filter((t: WhatsAppTemplate) => t.status === "APPROVED")
      .filter((t: WhatsAppTemplate) => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [templates, searchQuery]);

  const getBodyText = (template: WhatsAppTemplate) => {
    return template.components?.find((c: any) => c.type === "BODY" || c.type === "body")?.text || "";
  };

  const getVariableCount = (template: WhatsAppTemplate) => {
    const text = getBodyText(template);
    if (!text) return 0;
    const matches = text.match(/\{\{(\d+)\}\}/g);
    return matches ? matches.length : 0;
  };

  const renderPreview = () => {
    if (!selectedTemplate) return null;
    let text = getBodyText(selectedTemplate);
    const count = getVariableCount(selectedTemplate);
    for (let i = 1; i <= count; i++) {
      const val = variables[`${i}`] || `{{${i}}}`;
      // Highlight the replaced variable in the preview
      text = text.replace(new RegExp(`\\{\\{${i}\\}\\}`, 'g'), val);
    }

    return (
      <div className="bg-[#E7FFDB] dark:bg-[#005C4B] p-3 rounded-lg rounded-tl-none shadow-sm text-sm text-foreground max-w-[85%] whitespace-pre-wrap">
        {text}
      </div>
    );
  };

  if (!open) {
    return (
      <Button 
        type="button" 
        size="lg" 
        onClick={() => setOpen(true)}
        disabled={disabled || isLoading}
        className="w-full shadow-sm bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 hover:border-primary/30 transition-all font-medium"
      >
        <MessageSquareText className="mr-2 h-5 w-5" />
        {isLoading ? "Loading templates..." : "Choose WhatsApp Template"}
      </Button>
    );
  }

  const handleClose = () => {
    setOpen(false);
    setSelectedTemplate(null);
    setVariables({});
    setSearchQuery("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            {selectedTemplate && (
              <button 
                onClick={() => {
                  setSelectedTemplate(null);
                  setVariables({});
                }}
                className="p-1.5 hover:bg-muted rounded-full transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {selectedTemplate ? "Configure Template" : "Select WhatsApp Template"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedTemplate ? selectedTemplate.name : "Choose an approved template to start the conversation."}
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col bg-background">
          <AnimatePresence mode="wait">
            {!selectedTemplate ? (
              <motion.div 
                key="list"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                <div className="p-4 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input 
                      type="text" 
                      placeholder="Search templates..." 
                      className="w-full pl-9 pr-4 py-2.5 bg-muted/50 border-none rounded-xl focus:ring-2 focus:ring-primary/50 text-sm transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {approvedTemplates.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
                      <MessageSquareText className="h-10 w-10 opacity-20" />
                      <p>No templates found.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {approvedTemplates.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            const count = getVariableCount(t);
                            if (count > 0) {
                              setSelectedTemplate(t);
                            } else {
                              onSelect(t, {});
                              handleClose();
                            }
                          }}
                          className="text-left p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/50 hover:border-primary/30 hover:shadow-md transition-all group flex flex-col h-full"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-sm group-hover:text-primary transition-colors">{t.name}</span>
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                              {t.language}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed flex-1">
                            {getBodyText(t) || "No body content."}
                          </p>
                        </button>
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
                className="flex flex-col h-full overflow-y-auto"
              >
                <div className="p-6 space-y-6">
                  {/* Live Preview */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4 text-primary" />
                      Live Preview
                    </h3>
                    <div className="p-4 rounded-xl border border-border bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] dark:bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] bg-repeat bg-opacity-10 shadow-inner">
                      {renderPreview()}
                    </div>
                  </div>

                  {/* Variables Form */}
                  {getVariableCount(selectedTemplate) > 0 && (
                    <div className="space-y-4 pt-4 border-t border-border">
                      <h3 className="text-sm font-medium">Template Variables</h3>
                      <div className="grid gap-4">
                        {Array.from({ length: getVariableCount(selectedTemplate) }).map((_, i) => (
                          <div key={i} className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Variable {`{{${i + 1}}}`}
                            </label>
                            <input
                              type="text"
                              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm shadow-sm transition-all focus:ring-2 focus:ring-primary/50 focus:border-primary"
                              value={variables[`${i + 1}`] || ""}
                              onChange={(e) => setVariables(prev => ({ ...prev, [`${i + 1}`]: e.target.value }))}
                              placeholder={`Enter value for {{${i + 1}}}`}
                              autoFocus={i === 0}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-auto p-4 border-t border-border bg-muted/30 flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => setSelectedTemplate(null)}>
                    Back
                  </Button>
                  <Button 
                    onClick={() => {
                      onSelect(selectedTemplate, variables);
                      handleClose();
                    }}
                    className="gap-2 shadow-lg"
                  >
                    <Send className="h-4 w-4" />
                    Send Template
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
