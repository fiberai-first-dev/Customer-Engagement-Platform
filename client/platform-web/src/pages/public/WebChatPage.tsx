import { EmbedWebChat } from "../../embed/EmbedWebChat";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** Public preview page for the embeddable web chat (`/chat`). */
export function WebChatPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1220] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(15,118,110,0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(59,130,246,0.12), transparent)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300/90">
          Web Chat
        </p>
        <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Preview your site widget
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-300">
          Same bubble your customers see. Open it, share a name and WhatsApp number, and
          the thread shows up in the CEP inbox under Web Chat.
        </p>
        <p className="mt-8 text-sm text-slate-400">
          Use the chat button in the corner to try a conversation.
        </p>
      </div>
      <EmbedWebChat
        apiBase={API_BASE || window.location.origin}
        title="Chat with us"
        storageKey="cep_web_chat_preview"
      />
    </div>
  );
}
