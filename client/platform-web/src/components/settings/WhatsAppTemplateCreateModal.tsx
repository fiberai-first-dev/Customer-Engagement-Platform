import { useState, useMemo, useEffect } from "react";
import { X, Plus, Trash2, Loader2, MessageSquare, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { useCreateTemplate } from "../../api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ─── Constants ───────────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: "en", label: "English (en)" },
  { value: "en_US", label: "English US (en_US)" },
  { value: "hi", label: "Hindi (hi)" },
  { value: "ar", label: "Arabic (ar)" },
  { value: "es", label: "Spanish (es)" },
  { value: "es_MX", label: "Spanish MX (es_MX)" },
  { value: "pt_BR", label: "Portuguese BR (pt_BR)" },
  { value: "fr", label: "French (fr)" },
  { value: "de", label: "German (de)" },
  { value: "it", label: "Italian (it)" },
  { value: "ru", label: "Russian (ru)" },
  { value: "id", label: "Indonesian (id)" },
  { value: "ms", label: "Malay (ms)" },
  { value: "th", label: "Thai (th)" },
  { value: "tr", label: "Turkish (tr)" },
  { value: "uk", label: "Ukrainian (uk)" },
];

const INTERNAL_CATEGORIES = [
  { value: "CUSTOMER_REENGAGEMENT", label: "Customer Re-engagement" },
  { value: "MARKETING", label: "Marketing" },
  { value: "UTILITY", label: "Utility" },
  { value: "AUTHENTICATION", label: "Authentication" },
  { value: "OTHER", label: "Other" },
];

const META_CATEGORIES = [
  { value: "MARKETING", label: "Marketing" },
  { value: "UTILITY", label: "Utility" },
  { value: "AUTHENTICATION", label: "Authentication" },
];

const HEADER_TYPES = [
  { value: "NONE", label: "None" },
  { value: "TEXT", label: "Text" },
  { value: "IMAGE", label: "Image (URL or handle)" },
  { value: "VIDEO", label: "Video (URL or handle)" },
  { value: "DOCUMENT", label: "Document (URL or handle)" },
];

const BUTTON_TYPES = [
  { value: "QUICK_REPLY", label: "Quick reply" },
  { value: "URL", label: "URL" },
  { value: "PHONE_NUMBER", label: "Phone number" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

interface VariableExample {
  label: string;
  example: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractVariables(text: string): number[] {
  const matches = text.match(/\{\{(\d+)\}\}/g) ?? [];
  const nums = [...new Set(matches.map((m) => parseInt(m.replace(/[{}]/g, ""))))];
  return nums.sort((a, b) => a - b);
}

function applyExamples(text: string, examples: Record<number, VariableExample>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const ex = examples[parseInt(n)]?.example;
    return ex || `{{${n}}}`;
  });
}

function buildComponents(
  headerType: string,
  headerContent: string,
  body: string,
  footer: string,
  buttons: TemplateButton[],
  bodyExamples: Record<number, VariableExample>,
  headerExamples: Record<number, VariableExample>
): any[] {
  const components: any[] = [];

  if (headerType !== "NONE" && headerContent.trim()) {
    const headerVarNums = extractVariables(headerContent);
    const comp: any = {
      type: "HEADER",
      format: headerType,
    };
    if (headerType === "TEXT") {
      comp.text = headerContent;
      if (headerVarNums.length > 0) {
        comp.example = {
          header_text: headerVarNums.map((n) => headerExamples[n]?.example || `value${n}`),
        };
      }
    } else {
      // IMAGE / VIDEO / DOCUMENT — use a URL as example handle
      comp.example = { header_handle: [headerContent] };
    }
    components.push(comp);
  }

  if (body.trim()) {
    const bodyVarNums = extractVariables(body);
    const comp: any = { type: "BODY", text: body };
    if (bodyVarNums.length > 0) {
      comp.example = {
        body_text: [bodyVarNums.map((n) => bodyExamples[n]?.example || `value${n}`)],
      };
    }
    components.push(comp);
  }

  if (footer.trim()) {
    components.push({ type: "FOOTER", text: footer });
  }

  if (buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons.map((b) => {
        const btn: any = { type: b.type, text: b.text };
        if (b.type === "URL" && b.url) btn.url = b.url;
        if (b.type === "PHONE_NUMBER" && b.phone_number)
          btn.phone_number = b.phone_number;
        return btn;
      }),
    });
  }

  return components;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: {
    name?: string;
    language?: string;
    internalCategory?: string;
    metaCategory?: string;
    headerType?: string;
    headerContent?: string;
    body?: string;
    footer?: string;
    buttons?: TemplateButton[];
  };
}

const labelCls =
  "block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5";
const inputCls =
  "w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-muted-foreground/60";
const selectCls = inputCls + " cursor-pointer appearance-none";

export function WhatsAppTemplateCreateModal({ open, onClose, prefill }: Props) {
  const { mutateAsync: createTemplate, isPending } = useCreateTemplate();

  // Basic fields
  const [name, setName] = useState(prefill?.name ?? "");
  const [language, setLanguage] = useState(prefill?.language ?? "en");
  const [internalCategory, setInternalCategory] = useState(
    prefill?.internalCategory ?? "UTILITY"
  );
  const [metaCategory, setMetaCategory] = useState(
    prefill?.metaCategory ?? "UTILITY"
  );

  // Components
  const [headerType, setHeaderType] = useState(prefill?.headerType ?? "NONE");
  const [headerContent, setHeaderContent] = useState(prefill?.headerContent ?? "");
  const [body, setBody] = useState(prefill?.body ?? "");
  const [footer, setFooter] = useState(prefill?.footer ?? "");
  const [buttons, setButtons] = useState<TemplateButton[]>(prefill?.buttons ?? []);

  // Variable examples
  const [bodyExamples, setBodyExamples] = useState<Record<number, VariableExample>>({});
  const [headerExamples, setHeaderExamples] = useState<Record<number, VariableExample>>({});

  const [submitted, setSubmitted] = useState(false);

  // Auto-populate examples state when body changes
  const bodyVarNums = useMemo(() => extractVariables(body), [body]);
  const headerVarNums = useMemo(
    () => (headerType === "TEXT" ? extractVariables(headerContent) : []),
    [headerType, headerContent]
  );

  useEffect(() => {
    if (prefill) {
      setName(prefill.name ?? "");
      setLanguage(prefill.language ?? "en");
      setInternalCategory(prefill.internalCategory ?? "UTILITY");
      setMetaCategory(prefill.metaCategory ?? "UTILITY");
      setHeaderType(prefill.headerType ?? "NONE");
      setHeaderContent(prefill.headerContent ?? "");
      setBody(prefill.body ?? "");
      setFooter(prefill.footer ?? "");
      setButtons(prefill.buttons ?? []);
    }
  }, [prefill]);

  // ─── Validation ─────────────────────────────────────────────────────────
  const nameError = useMemo(() => {
    if (!name) return "Template name is required";
    if (!/^[a-z0-9_]+$/.test(name))
      return "Use only lowercase letters, numbers, and underscores";
    if (name.length > 512) return "Name too long";
    return null;
  }, [name]);

  const bodyError = useMemo(() => {
    if (!body.trim()) return "Body text is required";
    return null;
  }, [body]);

  const buttonErrors = useMemo(() => {
    const qr = buttons.filter((b) => b.type === "QUICK_REPLY").length;
    const url = buttons.filter((b) => b.type === "URL").length;
    const phone = buttons.filter((b) => b.type === "PHONE_NUMBER").length;
    if (qr > 3) return "Max 3 quick reply buttons";
    if (url > 2) return "Max 2 URL buttons";
    if (phone > 1) return "Max 1 phone number button";
    if (buttons.some((b) => !b.text.trim())) return "All button texts are required";
    if (buttons.filter((b) => b.type === "URL").some((b) => !b.url?.trim()))
      return "URL button requires a URL";
    return null;
  }, [buttons]);

  const isValid =
    !nameError && !bodyError && !buttonErrors;

  // ─── Live Preview ────────────────────────────────────────────────────────
  const previewHeader =
    headerType === "TEXT"
      ? applyExamples(headerContent, headerExamples)
      : null;
  const previewBody = applyExamples(body, bodyExamples);

  // ─── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!isValid) return;
    const components = buildComponents(
      headerType,
      headerContent,
      body,
      footer,
      buttons,
      bodyExamples,
      headerExamples
    );
    try {
      await createTemplate({ name, language, internalCategory, metaCategory, components });
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to create template");
    }
  };

  const handleClose = () => {
    setName("");
    setLanguage("en");
    setInternalCategory("UTILITY");
    setMetaCategory("UTILITY");
    setHeaderType("NONE");
    setHeaderContent("");
    setBody("");
    setFooter("");
    setButtons([]);
    setBodyExamples({});
    setHeaderExamples({});
    setSubmitted(false);
    onClose();
  };

  if (!open) return null;

  // ─── Success state ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-card border border-border rounded-2xl shadow-2xl p-10 flex flex-col items-center text-center max-w-md w-full"
        >
          <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <MessageSquare className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">Submitted for review</h2>
          <p className="text-sm text-muted-foreground mb-6">
            <strong className="text-foreground">{name}</strong> has been submitted to
            Meta. Approval usually takes up to 24 hours. The template will appear as{" "}
            <span className="font-semibold text-yellow-600 dark:text-yellow-400">
              PENDING
            </span>{" "}
            until Meta approves it.
          </p>
          <Button onClick={handleClose} className="w-full">
            Done
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[95vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Create WhatsApp Template</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {prefill ? "Pre-filled from existing template — submit as a new name" : "Submitted to Meta for review · Approval usually takes up to 24h"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {/* Form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Basic info */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
                Basic Info
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Template Name *</label>
                  <input
                    className={inputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="e.g. order_ready_en"
                  />
                  {nameError && name && (
                    <p className="text-xs text-red-500 mt-1">{nameError}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Lowercase, numbers, underscores only
                  </p>
                </div>
                <div className="relative">
                  <label className={labelCls}>Language *</label>
                  <select
                    className={selectCls}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 bottom-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
                <div className="relative">
                  <label className={labelCls}>Internal Category *</label>
                  <select
                    className={selectCls}
                    value={internalCategory}
                    onChange={(e) => setInternalCategory(e.target.value)}
                  >
                    {INTERNAL_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 bottom-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
                <div className="relative">
                  <label className={labelCls}>Meta Category *</label>
                  <select
                    className={selectCls}
                    value={metaCategory}
                    onChange={(e) => setMetaCategory(e.target.value)}
                  >
                    {META_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 bottom-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </section>

            {/* Content */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
                Content
              </h3>

              {/* Header */}
              <div>
                <label className={labelCls}>Header</label>
                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      className={selectCls + " w-40"}
                      value={headerType}
                      onChange={(e) => {
                        setHeaderType(e.target.value);
                        setHeaderContent("");
                      }}
                    >
                      {HEADER_TYPES.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 bottom-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                  {headerType !== "NONE" && (
                    <input
                      className={inputCls + " flex-1"}
                      value={headerContent}
                      onChange={(e) => setHeaderContent(e.target.value)}
                      placeholder={
                        headerType === "TEXT"
                          ? "Header text (supports {{1}} variables)"
                          : "Media URL or handle"
                      }
                    />
                  )}
                </div>
              </div>

              {/* Body */}
              <div>
                <label className={labelCls}>Body *</label>
                <textarea
                  className={inputCls + " min-h-[100px] resize-y"}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi {{1}}, your order {{2}} is ready for pickup!"
                />
                {bodyError && body !== "" && (
                  <p className="text-xs text-red-500 mt-1">{bodyError}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Use {"{{1}}"}, {"{{2}}"}, … for variables
                </p>
              </div>

              {/* Footer */}
              <div>
                <label className={labelCls}>Footer (optional)</label>
                <input
                  className={inputCls}
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  placeholder="e.g. Thank you for shopping with us"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  No variables allowed in footer
                </p>
              </div>
            </section>

            {/* Variable Examples */}
            {(bodyVarNums.length > 0 || headerVarNums.length > 0) && (
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
                  Variable Examples{" "}
                  <span className="text-red-500">*</span>
                  <span className="normal-case font-normal ml-1">(required by Meta for review)</span>
                </h3>
                {headerVarNums.map((n) => (
                  <div key={`header-${n}`} className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <label className={labelCls}>Header {"{{" + n + "}}"} Label</label>
                      <input
                        className={inputCls}
                        value={headerExamples[n]?.label ?? ""}
                        onChange={(e) =>
                          setHeaderExamples((prev) => ({
                            ...prev,
                            [n]: { ...prev[n], label: e.target.value },
                          }))
                        }
                        placeholder="e.g. customer_name"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Example Value</label>
                      <input
                        className={inputCls}
                        value={headerExamples[n]?.example ?? ""}
                        onChange={(e) =>
                          setHeaderExamples((prev) => ({
                            ...prev,
                            [n]: { ...prev[n], example: e.target.value },
                          }))
                        }
                        placeholder="e.g. John"
                      />
                    </div>
                  </div>
                ))}
                {bodyVarNums.map((n) => (
                  <div key={`body-${n}`} className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <label className={labelCls}>Body {"{{" + n + "}}"} Label</label>
                      <input
                        className={inputCls}
                        value={bodyExamples[n]?.label ?? ""}
                        onChange={(e) =>
                          setBodyExamples((prev) => ({
                            ...prev,
                            [n]: { ...prev[n], label: e.target.value },
                          }))
                        }
                        placeholder="e.g. order_id"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Example Value</label>
                      <input
                        className={inputCls}
                        value={bodyExamples[n]?.example ?? ""}
                        onChange={(e) =>
                          setBodyExamples((prev) => ({
                            ...prev,
                            [n]: { ...prev[n], example: e.target.value },
                          }))
                        }
                        placeholder="e.g. ORD-9231"
                      />
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Buttons */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Buttons (optional)
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setButtons((prev) => [
                      ...prev,
                      { type: "QUICK_REPLY", text: "" },
                    ])
                  }
                  className="text-xs flex items-center gap-1 text-primary hover:underline font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add button
                </button>
              </div>
              {buttonErrors && (
                <p className="text-xs text-red-500">{buttonErrors}</p>
              )}
              <AnimatePresence>
                {buttons.map((btn, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border border-border rounded-xl p-3 space-y-2 bg-muted/20"
                  >
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-shrink-0">
                        <select
                          className={selectCls + " w-36 text-xs py-2"}
                          value={btn.type}
                          onChange={(e) =>
                            setButtons((prev) =>
                              prev.map((b, j) =>
                                j === i ? { ...b, type: e.target.value as any } : b
                              )
                            )
                          }
                        >
                          {BUTTON_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 bottom-2.5 h-3 w-3 text-muted-foreground pointer-events-none" />
                      </div>
                      <input
                        className={inputCls + " flex-1 py-2 text-xs"}
                        value={btn.text}
                        onChange={(e) =>
                          setButtons((prev) =>
                            prev.map((b, j) =>
                              j === i ? { ...b, text: e.target.value } : b
                            )
                          )
                        }
                        placeholder="Button label"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setButtons((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {btn.type === "URL" && (
                      <input
                        className={inputCls + " py-2 text-xs"}
                        value={btn.url ?? ""}
                        onChange={(e) =>
                          setButtons((prev) =>
                            prev.map((b, j) =>
                              j === i ? { ...b, url: e.target.value } : b
                            )
                          )
                        }
                        placeholder="https://example.com/{{1}}"
                      />
                    )}
                    {btn.type === "PHONE_NUMBER" && (
                      <input
                        className={inputCls + " py-2 text-xs"}
                        value={btn.phone_number ?? ""}
                        onChange={(e) =>
                          setButtons((prev) =>
                            prev.map((b, j) =>
                              j === i ? { ...b, phone_number: e.target.value } : b
                            )
                          )
                        }
                        placeholder="+1234567890"
                      />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </section>
          </div>

          {/* Live Preview Panel */}
          <div className="hidden lg:flex flex-col w-72 xl:w-80 border-l border-border bg-muted/20 overflow-y-auto shrink-0">
            <div className="px-5 py-4 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Live Preview
              </p>
            </div>
            <div
              className="flex-1 p-4 flex flex-col gap-3"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,.015) 10px, rgba(0,0,0,.015) 20px)",
              }}
            >
              {/* WhatsApp-style bubble */}
              <div className="max-w-[240px] w-full space-y-0.5">
                {/* Header */}
                {headerType !== "NONE" && headerContent && (
                  <div className="bg-[#E7FFDB] dark:bg-[#005C4B] rounded-t-2xl rounded-br-2xl px-3 pt-2.5 pb-1">
                    {headerType === "TEXT" ? (
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">
                        {previewHeader}
                      </p>
                    ) : (
                      <div className="h-20 bg-black/10 rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                        {headerType} media
                      </div>
                    )}
                  </div>
                )}

                {/* Body */}
                {body && (
                  <div
                    className={`bg-[#E7FFDB] dark:bg-[#005C4B] px-3 py-2.5 text-sm text-gray-800 dark:text-white whitespace-pre-wrap leading-snug ${
                      headerType === "NONE"
                        ? "rounded-t-2xl rounded-br-2xl"
                        : footer || buttons.length > 0
                        ? ""
                        : "rounded-b-2xl rounded-br-none"
                    }`}
                  >
                    {previewBody || <span className="opacity-40">Your body text…</span>}
                  </div>
                )}

                {/* Footer */}
                {footer && (
                  <div className="bg-[#E7FFDB] dark:bg-[#005C4B] px-3 pb-2 text-xs text-gray-500 dark:text-gray-300">
                    {footer}
                  </div>
                )}

                {/* Buttons */}
                {buttons.length > 0 && (
                  <div className="space-y-0.5">
                    {buttons.map((btn, i) => (
                      <div
                        key={i}
                        className="bg-white dark:bg-[#1f2c34] border border-[#d1f4cc] dark:border-[#005C4B]/60 rounded-xl px-3 py-2 text-center text-xs font-semibold text-primary"
                      >
                        {btn.text || "Button"}
                      </div>
                    ))}
                  </div>
                )}

                {!body && (
                  <div className="bg-[#E7FFDB] dark:bg-[#005C4B] rounded-2xl px-3 py-2.5 text-sm text-gray-400 dark:text-gray-500 italic">
                    Body text will appear here…
                  </div>
                )}

                {/* Timestamp */}
                <div className="text-right pr-1">
                  <span className="text-[10px] text-muted-foreground">12:00</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-border px-6 py-4 bg-muted/20 flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-muted-foreground hidden sm:block">
            Review takes up to 24h · Template will appear as{" "}
            <span className="text-yellow-600 dark:text-yellow-400 font-semibold">PENDING</span>
          </p>
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || isPending}
              className="gap-2 min-w-[160px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit for review"
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
