import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

export type EmbedWebChatProps = {
  /** Tenant API origin, e.g. https://api.cep-demo.fybud.com */
  apiBase: string;
  /** Widget key from Settings (sent as X-CEP-Widget-Key) */
  widgetKey: string;
  /** Header title */
  title?: string;
  /** Accent color */
  color?: string;
  /** localStorage namespace so multiple tenants on one browser don't collide */
  storageKey?: string;
};

type ChatMessage = {
  id: string;
  content: string;
  direction: "incoming" | "outgoing";
  createdAt: string;
};

const DEFAULT_COLOR = "#0f766e";

function normalizeApiBase(raw: string) {
  return raw.replace(/\/$/, "");
}

function isValidWhatsApp(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function EmbedWebChat({
  apiBase,
  widgetKey,
  title = "Chat with us",
  color = DEFAULT_COLOR,
  storageKey = "cep_web_chat_id",
}: EmbedWebChatProps) {
  const base = normalizeApiBase(apiBase);

  const widgetHeaders = (json = false): HeadersInit => {
    const h: Record<string, string> = {
      "X-CEP-Widget-Key": widgetKey,
    };
    if (json) h["Content-Type"] = "application/json";
    return h;
  };

  const [open, setOpen] = useState(false);
  const [externalId, setExternalId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async (id: string) => {
    try {
      const res = await fetch(
        `${base}/api/v1/web-chat/messages?externalId=${encodeURIComponent(id)}`,
        { headers: widgetHeaders() },
      );
      if (!res.ok) return;
      const data = (await res.json()) as ChatMessage[];
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      /* ignore transient poll errors */
    }
  };

  const startSession = async () => {
    setFormError(null);
    if (!widgetKey) {
      setFormError("Widget key missing — check the embed snippet");
      return;
    }
    if (!name.trim()) {
      setFormError("Please enter your name");
      return;
    }
    if (!isValidWhatsApp(whatsapp)) {
      setFormError("Enter a valid WhatsApp number with country code (e.g. +91 9876543210)");
      return;
    }

    setBooting(true);
    try {
      const res = await fetch(`${base}/api/v1/web-chat`, {
        method: "POST",
        headers: widgetHeaders(true),
        body: JSON.stringify({
          name: name.trim(),
          whatsapp: whatsapp.trim(),
          externalId: externalId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error || "Could not start chat");
        return;
      }
      setExternalId(data.externalId);
      try {
        localStorage.setItem(storageKey, data.externalId);
      } catch {
        /* private mode */
      }
      await fetchMessages(data.externalId);
    } catch {
      setFormError("Network error — please try again");
    } finally {
      setBooting(false);
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !externalId || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    const optimistic: ChatMessage = {
      id: `tmp_${Date.now()}`,
      content,
      direction: "incoming",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await fetch(`${base}/api/v1/web-chat/messages`, {
        method: "POST",
        headers: widgetHeaders(true),
        body: JSON.stringify({ externalId, content }),
      });
      await fetchMessages(externalId);
    } catch {
      setFormError("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!open || !externalId) return;
    void fetchMessages(externalId);
    const t = setInterval(() => void fetchMessages(externalId), 3000);
    return () => clearInterval(t);
  }, [open, externalId, base]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const cssVars = {
    ["--cep-wc-color" as string]: color,
  } as CSSProperties;

  return (
    <div style={{ ...rootStyle, ...cssVars }} data-cep-webchat>
      {open ? (
        <div style={panelStyle}>
          <div style={headerStyle}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                We typically reply within minutes
              </div>
            </div>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              style={iconBtnStyle}
            >
              ✕
            </button>
          </div>

          {!externalId ? (
            <div style={formWrapStyle}>
              <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.45 }}>
                Enter your name and WhatsApp number so we can help you in one place —
                even if you message us on WhatsApp later.
              </p>
              <label style={labelStyle}>
                Name
                <input
                  style={inputStyle}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </label>
              <label style={labelStyle}>
                WhatsApp number
                <input
                  style={inputStyle}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+91 9876543210"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>
              {formError && <p style={errorStyle}>{formError}</p>}
              <button
                type="button"
                onClick={() => void startSession()}
                disabled={booting}
                style={primaryBtnStyle}
              >
                {booting ? "Connecting…" : "Start chat"}
              </button>
            </div>
          ) : (
            <>
              <div style={messagesStyle}>
                {messages.length === 0 && (
                  <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 24 }}>
                    Say hello — send your first message.
                  </p>
                )}
                {messages.map((msg) => {
                  const isVisitor = msg.direction === "incoming";
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        justifyContent: isVisitor ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          ...bubbleStyle,
                          background: isVisitor ? color : "#fff",
                          color: isVisitor ? "#fff" : "#0f172a",
                          border: isVisitor ? "none" : "1px solid #e2e8f0",
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <form onSubmit={sendMessage} style={composerStyle}>
                <input
                  style={{ ...inputStyle, flex: 1, margin: 0 }}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message…"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  style={{
                    ...primaryBtnStyle,
                    width: "auto",
                    padding: "10px 14px",
                    opacity: !input.trim() || sending ? 0.5 : 1,
                  }}
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          aria-label="Open chat"
          onClick={() => setOpen(true)}
          style={fabStyle}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

const rootStyle: CSSProperties = {
  all: "initial",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  position: "fixed",
  right: 20,
  bottom: 20,
  zIndex: 2147483000,
  boxSizing: "border-box",
};

const fabStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  background: "var(--cep-wc-color, #0f766e)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.25)",
};

const panelStyle: CSSProperties = {
  width: 360,
  maxWidth: "calc(100vw - 24px)",
  height: 520,
  maxHeight: "calc(100vh - 40px)",
  background: "#fff",
  borderRadius: 16,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.28)",
  border: "1px solid #e2e8f0",
};

const headerStyle: CSSProperties = {
  background: "var(--cep-wc-color, #0f766e)",
  color: "#fff",
  padding: "14px 16px",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const iconBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: 4,
  opacity: 0.9,
};

const formWrapStyle: CSSProperties = {
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  flex: 1,
  background: "#f8fafc",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "#334155",
};

const inputStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
};

const primaryBtnStyle: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "12px 14px",
  background: "var(--cep-wc-color, #0f766e)",
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#b91c1c",
};

const messagesStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 16,
  background: "#f1f5f9",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const bubbleStyle: CSSProperties = {
  maxWidth: "80%",
  borderRadius: 14,
  padding: "8px 12px",
  fontSize: 13,
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const composerStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  padding: 12,
  borderTop: "1px solid #e2e8f0",
  background: "#fff",
};
