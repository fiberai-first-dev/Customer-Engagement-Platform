import { EmbedWebChat } from "../../embed/EmbedWebChat";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function readPreviewKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.search).get("key")?.trim() || "";
  } catch {
    return "";
  }
}

/** Public preview page for the embeddable web chat (`/chat`). */
export function WebChatPage() {
  const widgetKey = readPreviewKey();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: "64px 24px 120px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0, color: "#0f172a" }}>Web Chat preview</h1>
        <p style={{ marginTop: 12, color: "#475569", lineHeight: 1.5, fontSize: 14 }}>
          This is the same widget clients embed on their site. Open the bubble, enter
          your <strong>name</strong> and <strong>WhatsApp number</strong>, then chat —
          the conversation appears in the CEP inbox under Web Chat and is linked to
          that WhatsApp identity.
        </p>
        {!widgetKey ? (
          <p style={{ marginTop: 16, color: "#b45309", fontSize: 13 }}>
            Open this page from Settings → Web Chat embed → Preview widget so the
            widget key is included.
          </p>
        ) : null}
      </div>
      <EmbedWebChat
        apiBase={API_BASE || window.location.origin}
        widgetKey={widgetKey}
        title="Chat with us"
        storageKey="cep_web_chat_preview"
      />
    </div>
  );
}
