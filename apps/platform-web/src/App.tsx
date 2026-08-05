import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type Conversation,
  type ConversationStatus,
  type Inbox,
  type Message,
} from "./api";

type View = "inbox" | "settings";
type Theme = "dark" | "light";

const POLL_MS = 3000;

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function channelLabel(type: string) {
  if (type === "whatsapp") return "WhatsApp";
  if (type === "instagram") return "Instagram";
  if (type === "email") return "Email";
  return type;
}

function readTheme(): Theme {
  const stored = localStorage.getItem("cep-theme");
  return stored === "light" ? "light" : "dark";
}

export function App() {
  const [view, setView] = useState<View>("inbox");
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [status, setStatus] = useState<ConversationStatus | "all">("open");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedIdRef = useRef<string | null>(null);
  const statusRef = useRef(status);
  selectedIdRef.current = selectedId;
  statusRef.current = status;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cep-theme", theme);
  }, [theme]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  async function loadConversations(nextStatus = statusRef.current, opts?: { preserveSelection?: boolean }) {
    const data = await api.listConversations({
      status: nextStatus === "all" ? undefined : nextStatus,
    });
    setConversations(data);
    const current = selectedIdRef.current;
    if (opts?.preserveSelection) {
      if (current && !data.some((c) => c.id === current) && data[0]) {
        setSelectedId(data[0].id);
      } else if (!current && data[0]) {
        setSelectedId(data[0].id);
      }
      return;
    }
    if (current && !data.some((c) => c.id === current)) {
      setSelectedId(data[0]?.id ?? null);
    } else if (!current && data[0]) {
      setSelectedId(data[0].id);
    }
  }

  async function loadMessages(conversationId: string) {
    const data = await api.getMessages(conversationId);
    setMessages(data);
  }

  async function loadSettings() {
    const accounts = await api.listAccounts();
    const account = accounts[0];
    if (!account) {
      setAccountId(null);
      setInboxes([]);
      return;
    }
    setAccountId(account.id);
    setInboxes(await api.listInboxes(account.id));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadConversations();
        await loadSettings();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    loadMessages(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load messages"),
    );
  }, [selectedId]);

  // Auto-refresh inbox + open thread (Chatwoot-like live feel)
  useEffect(() => {
    if (view !== "inbox") return;
    const tick = async () => {
      try {
        await loadConversations(statusRef.current, { preserveSelection: true });
        const id = selectedIdRef.current;
        if (id) await loadMessages(id);
      } catch {
        // keep last good UI; next tick retries
      }
    };
    const handle = window.setInterval(tick, POLL_MS);
    const onFocus = () => {
      void tick();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(handle);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function sendReply() {
    if (!selectedId || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendMessage(selectedId, draft.trim());
      setDraft("");
      await loadMessages(selectedId);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolveConversation() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.updateConversation(selectedId, "resolved");
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <aside className="rail">
        <div className="rail-logo">CEP</div>
        <button
          className={view === "inbox" ? "active" : ""}
          title="Conversations"
          onClick={() => setView("inbox")}
        >
          Inbox
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          title="Settings"
          onClick={() => setView("settings")}
        >
          Set
        </button>
        <div className="rail-spacer" />
        <button
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </aside>

      <div className="main">
        {error ? <div className="error">{error}</div> : null}

        {view === "inbox" ? (
          <div className="inbox-layout">
            <section className="conv-list">
              <header>
                <h1>Conversations</h1>
                <div className="row">
                  <span className="muted">Live</span>
                </div>
              </header>
              <div className="filters">
                {(["open", "pending", "resolved", "all"] as const).map((s) => (
                  <button
                    key={s}
                    className={`chip ${status === s ? "active" : ""}`}
                    onClick={() => {
                      setStatus(s);
                      loadConversations(s).catch((err) =>
                        setError(err instanceof Error ? err.message : "Load failed"),
                      );
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="conv-items">
                {loading ? <div className="thread-empty">Loading…</div> : null}
                {!loading && conversations.length === 0 ? (
                  <div className="thread-empty">
                    No conversations yet.
                    <div className="muted" style={{ marginTop: 8 }}>
                      Messages appear when WhatsApp, Instagram, or Email webhooks arrive.
                    </div>
                  </div>
                ) : null}
                {conversations.map((c) => {
                  const preview = c.messages?.[0]?.content ?? "No messages";
                  return (
                    <button
                      key={c.id}
                      className={`conv-item ${selectedId === c.id ? "active" : ""}`}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <div className="name">{c.contact.name ?? "Unknown"}</div>
                      <div className="preview">{preview}</div>
                      <div className="meta">
                        <span className="badge">{channelLabel(c.channelType)}</span>
                        <span>{formatTime(c.lastMessageAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="thread">
              {!selected ? (
                <div className="thread-empty">Select a conversation</div>
              ) : (
                <>
                  <header>
                    <div>
                      <h1>{selected.contact.name ?? "Conversation"}</h1>
                      <div className="muted">
                        {channelLabel(selected.channelType)} · {selected.inbox.name} ·{" "}
                        {selected.status}
                      </div>
                    </div>
                    <div className="row">
                      {selected.status !== "resolved" ? (
                        <button className="btn secondary" disabled={busy} onClick={resolveConversation}>
                          Resolve
                        </button>
                      ) : null}
                    </div>
                  </header>
                  <div className="messages">
                    {messages.map((m) => (
                      <div key={m.id} className={`bubble ${m.direction}`}>
                        {m.subject ? <strong>{m.subject}</strong> : null}
                        <div>{m.content}</div>
                        <div className="time">
                          {m.direction} · {m.status} · {formatTime(m.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="composer">
                    <textarea
                      value={draft}
                      placeholder="Type a reply…"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void sendReply();
                        }
                      }}
                    />
                    <div className="composer-actions">
                      <span className="muted">Ctrl/⌘ + Enter to send</span>
                      <button className="btn" disabled={busy || !draft.trim()} onClick={sendReply}>
                        Send
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        ) : (
          <SettingsView
            accountId={accountId}
            inboxes={inboxes}
            busy={busy}
            onSaved={async () => {
              setBusy(true);
              try {
                await loadSettings();
              } finally {
                setBusy(false);
              }
            }}
            onError={setError}
            setBusy={setBusy}
          />
        )}
      </div>
    </div>
  );
}

function SettingsView(props: {
  accountId: string | null;
  inboxes: Inbox[];
  busy: boolean;
  onSaved: () => Promise<void>;
  onError: (msg: string | null) => void;
  setBusy: (v: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const inbox of props.inboxes) {
      next[inbox.id] = JSON.stringify(inbox.channelConfig ?? {}, null, 2);
    }
    setDrafts(next);
  }, [props.inboxes]);

  async function saveInbox(inbox: Inbox) {
    props.setBusy(true);
    props.onError(null);
    try {
      const parsed = JSON.parse(drafts[inbox.id] || "{}") as Record<string, unknown>;
      await api.updateInbox(inbox.id, { channelConfig: parsed });
      await props.onSaved();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      props.setBusy(false);
    }
  }

  return (
    <div className="settings">
      <div className="settings-header" style={{ paddingLeft: 0, border: 0 }}>
        <h1>Settings · Inboxes</h1>
      </div>
      <p className="muted">
        Configure WhatsApp, Instagram, and Email channel credentials (Chatwoot-style inbox
        settings). Values like <code>***</code> mean the secret is <strong>already saved</strong>{" "}
        (hidden for safety). Leave them as <code>***</code> unless you are replacing the token —
        do not clear them. Only non-secret fields (e.g. <code>phoneNumberId</code>) are shown in
        full.
      </p>
      {!props.accountId ? (
        <div className="card">No account found. Run <code>pnpm seed</code>.</div>
      ) : null}
      <div className="settings-grid">
        {props.inboxes.map((inbox) => (
          <div className="card" key={inbox.id}>
            <h2>
              {inbox.name}{" "}
              <span className="badge">{channelLabel(inbox.channelType)}</span>
            </h2>
            <div className="sub">
              Webhook: <code>{inbox.webhookUrl}</code>
            </div>
            <div className="field">
              <label>channelConfig (JSON)</label>
              <textarea
                rows={10}
                value={drafts[inbox.id] ?? "{}"}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [inbox.id]: e.target.value }))
                }
              />
            </div>
            <div className="row">
              <button className="btn" disabled={props.busy} onClick={() => saveInbox(inbox)}>
                Save
              </button>
              <span className="muted">
                {inbox.enabled ? "Enabled" : "Disabled"} · id {inbox.id}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
