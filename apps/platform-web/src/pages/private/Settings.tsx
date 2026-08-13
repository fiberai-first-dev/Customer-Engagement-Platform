import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  startChannelOAuth,
  useAccounts,
  useDisconnectInbox,
  useInboxes,
  useOAuthHints,
  useShopifyConfig,
  useUpdateInbox,
  useUpdateShopifyConfig,
  setupGuidePdfUrl,
  type Inbox,
} from "../../api";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import {
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  X,
} from "lucide-react";

type ChannelKey = "whatsapp" | "instagram" | "email" | "shopify";

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  /** Required to enable Connect on first setup. */
  required?: boolean;
};

const WA_FIELDS: FieldDef[] = [
  { key: "phoneNumberId", label: "Phone Number ID", required: true },
  { key: "accessToken", label: "Access Token", secret: true, required: true },
  { key: "verifyToken", label: "Verify Token", secret: true, required: true },
  { key: "appSecret", label: "App Secret", secret: true, required: true },
  { key: "businessAccountId", label: "Business Account ID" },
];

const IG_FIELDS: FieldDef[] = [
  { key: "instagramAppId", label: "Instagram App ID", required: true },
  { key: "instagramAppSecret", label: "Instagram App Secret", secret: true, required: true },
  { key: "verifyToken", label: "Verify Token", secret: true, required: true },
];

const EMAIL_FIELDS: FieldDef[] = [
  { key: "clientId", label: "Client ID", required: true },
  { key: "clientSecret", label: "Client Secret", secret: true, required: true },
  {
    key: "pubsubTopic",
    label: "Pub/Sub Topic",
    placeholder: "projects/…/topics/…",
    required: true,
  },
];

const SHOPIFY_FIELDS: FieldDef[] = [
  { key: "shop", label: "Shop subdomain", placeholder: "mystore", required: true },
  { key: "clientId", label: "Client ID", required: true },
  { key: "clientSecret", label: "Client Secret", secret: true, required: true },
];

function hasText(value?: string): boolean {
  return Boolean(value?.trim()) && value!.trim() !== "***";
}

function statusFromHealth(
  health?: Inbox["health"],
  connectedFallback = false,
): { label: string; tone: "ok" | "warn" | "error" | "idle" } {
  if (!health) {
    return connectedFallback
      ? { label: "Connected", tone: "ok" }
      : { label: "Not Connected", tone: "idle" };
  }
  if (health.level === "ok") return { label: "Connected", tone: "ok" };
  if (health.level === "warn") return { label: health.summary || "Needs attention", tone: "warn" };
  if (health.level === "error") {
    const missing = health.details.some((d) => /missing|not configured|not connected/i.test(d));
    return {
      label: missing ? "Not Connected" : "Error",
      tone: "error",
    };
  }
  if (health.level === "unknown") return { label: "Not Connected", tone: "idle" };
  return { label: "Not Connected", tone: "idle" };
}

function isLinkedStatus(tone: "ok" | "warn" | "error" | "idle") {
  return tone === "ok" || tone === "warn";
}

function CallbackUrlRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <p className="flex h-10 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-md border border-border bg-muted/40 px-3 font-mono text-xs text-foreground">
          {value}
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 gap-2 px-3"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function CallbackUrlsCard({
  channels,
}: {
  channels: { name: string; urls: { label: string; value?: string }[] }[];
}) {
  const available = channels.filter((c) => c.urls.some((u) => u.value));
  const [selected, setSelected] = useState(available[0]?.name ?? "");

  useEffect(() => {
    if (!available.some((c) => c.name === selected) && available[0]) {
      setSelected(available[0].name);
    }
  }, [available, selected]);

  const current = available.find((c) => c.name === selected) ?? available[0];
  if (!current) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold leading-none">Callback URLs</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Paste into Meta or Google when you connect a channel.
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="callback-url-select">
            Channel
          </label>
          <select
            id="callback-url-select"
            value={current.name}
            onChange={(e) => setSelected(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {available.map((channel) => (
              <option key={channel.name} value={channel.name}>
                {channel.name}
              </option>
            ))}
          </select>
        </div>
        {current.urls
          .filter((u) => u.value)
          .map((u) => (
            <CallbackUrlRow key={u.label} label={u.label} value={u.value!} />
          ))}
      </div>
    </div>
  );
}

function ConnectModal({
  title,
  description,
  fields,
  initialValues,
  submitting,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  fields: FieldDef[];
  initialValues: Record<string, string>;
  submitting: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const canSubmit = fields
    .filter((f) => f.required)
    .every((f) => hasText(values[f.key]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-modal-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 id="connect-modal-title" className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={submitting}
            className="h-9 w-9 shrink-0 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit || submitting) return;
            setError(null);
            void onSubmit(values).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Connection failed");
            });
          }}
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Details
            </p>
            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800">
                {error}
              </div>
            )}
            {fields.map((field) => {
              const show = !field.secret || revealed[field.key];
              return (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </label>
                  <div className="relative">
                    <Input
                      type={show ? "text" : "password"}
                      value={values[field.key] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      className={field.secret ? "pr-10" : undefined}
                    />
                    {field.secret && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                        title={show ? "Hide" : "Reveal"}
                        onClick={() =>
                          setRevealed((prev) => ({
                            ...prev,
                            [field.key]: !prev[field.key],
                          }))
                        }
                      >
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Saved only after the connection succeeds.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChannelRow({
  name,
  busy,
  linked,
  onConnect,
  onDisconnect,
}: {
  name: string;
  busy?: boolean;
  linked: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm font-semibold text-foreground">{name}</span>
      <div className="flex shrink-0 items-center gap-2">
        {linked ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onDisconnect}
            className="h-9 min-w-[6.75rem] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Disconnect
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={onConnect} disabled={busy} className="h-9 min-w-[6.75rem]">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const activeAccount = accounts?.[0];
  const { data: inboxes, isLoading: inboxesLoading } = useInboxes(activeAccount?.id);
  const { data: oauthHints } = useOAuthHints();
  const { mutateAsync: updateInboxAsync } = useUpdateInbox();
  const { mutateAsync: disconnectInboxAsync, isPending: disconnectingInbox } =
    useDisconnectInbox();
  const { data: shopify, isLoading: shopifyLoading } = useShopifyConfig();
  const { mutateAsync: updateShopifyAsync, isPending: shopifyBusy } = useUpdateShopifyConfig();

  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [connecting, setConnecting] = useState<"gmail" | "instagram" | null>(null);
  const [modal, setModal] = useState<ChannelKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<ChannelKey | null>(null);

  useEffect(() => {
    setConnecting(null);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setConnecting(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    const status = searchParams.get("status");
    if (!oauth || !status) return;

    setConnecting(null);
    setModal(null);

    if (status === "success") {
      void queryClient.invalidateQueries({ queryKey: ["inboxes"] });
      const who =
        oauth === "gmail"
          ? searchParams.get("email")
          : searchParams.get("username")
            ? `@${searchParams.get("username")}`
            : null;
      setBanner({
        tone: "ok",
        text: who
          ? `${oauth === "gmail" ? "Gmail" : "Instagram"} connected · ${who}`
          : `${oauth === "gmail" ? "Gmail" : "Instagram"} connected`,
      });
    } else {
      setBanner({
        tone: "err",
        text: searchParams.get("message") || "Connection failed",
      });
    }

    const next = new URLSearchParams(searchParams);
    ["oauth", "status", "message", "email", "username", "tab"].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, queryClient]);

  const waInbox = inboxes?.find((i) => i.channelType === "whatsapp");
  const igInbox = inboxes?.find((i) => i.channelType === "instagram");
  const emailInbox = inboxes?.find((i) => i.channelType === "email");

  const waStatus = statusFromHealth(waInbox?.health);
  const igStatus = statusFromHealth(igInbox?.health);
  const emailStatus = statusFromHealth(emailInbox?.health);
  const shopifyConnected = Boolean(shopify?.connected ?? shopify?.hasClientSecret);

  const startOAuth = async (
    provider: "gmail" | "instagram",
    inboxId: string,
    credentials: Record<string, string>,
  ) => {
    setConnecting(provider);
    setBanner({
      tone: "ok",
      text:
        provider === "gmail"
          ? "Opening Google to finish Gmail connection…"
          : "Opening Instagram to finish connection…",
    });
    try {
      const { url } = await startChannelOAuth(provider, inboxId, credentials);
      window.location.assign(url);
    } catch (err: unknown) {
      setBanner({
        tone: "err",
        text: err instanceof Error ? err.message : "Could not start connection",
      });
      setConnecting(null);
      throw err;
    }
  };

  const modalConfig = useMemo(() => {
    if (!modal) return null;
    if (modal === "whatsapp") {
      return {
        title: "Connect WhatsApp",
        description: "Enter your WhatsApp Business details to connect.",
        fields: WA_FIELDS,
        initialValues: {} as Record<string, string>,
        submitLabel: "Connect",
      };
    }
    if (modal === "instagram") {
      return {
        title: "Connect Instagram",
        description:
          "Save Login redirect in Meta (developers.facebook.com) first, then enter the app details here.",
        fields: IG_FIELDS,
        initialValues: {} as Record<string, string>,
        submitLabel: connecting === "instagram" ? "Connecting…" : "Connect",
      };
    }
    if (modal === "email") {
      return {
        title: "Connect Gmail",
        description:
          "Save Login redirect on the Google OAuth client first, then enter the client details here.",
        fields: EMAIL_FIELDS,
        initialValues: {} as Record<string, string>,
        submitLabel: connecting === "gmail" ? "Connecting…" : "Connect",
      };
    }
    return {
      title: "Connect Shopify",
      description: "Connect your store to show customers and orders in the inbox.",
      fields: SHOPIFY_FIELDS,
      initialValues: {} as Record<string, string>,
      submitLabel: "Connect",
    };
  }, [modal, connecting]);

  const disconnectLabel =
    disconnectTarget === "whatsapp"
      ? "WhatsApp"
      : disconnectTarget === "instagram"
        ? "Instagram"
        : disconnectTarget === "email"
          ? "Gmail"
          : disconnectTarget === "shopify"
            ? "Shopify"
            : "";

  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget) return;
    try {
      if (disconnectTarget === "shopify") {
        await updateShopifyAsync({ disconnect: true });
      } else {
        const inbox =
          disconnectTarget === "whatsapp"
            ? waInbox
            : disconnectTarget === "instagram"
              ? igInbox
              : emailInbox;
        if (!inbox) throw new Error("Channel is not available.");
        await disconnectInboxAsync(inbox.id);
      }
      setBanner({
        tone: "ok",
        text: `${disconnectLabel} disconnected`,
      });
      setDisconnectTarget(null);
    } catch (err: unknown) {
      setBanner({
        tone: "err",
        text: err instanceof Error ? err.message : "Disconnect failed",
      });
      setDisconnectTarget(null);
    }
  };

  const handleConnectSubmit = async (values: Record<string, string>) => {
    if (!modal) return;
    setSubmitting(true);
    try {
      if (modal === "shopify") {
        await updateShopifyAsync({
          shop: values.shop,
          clientId: values.clientId,
          clientSecret: values.clientSecret,
        });
        setBanner({ tone: "ok", text: "Shopify connected" });
        setModal(null);
        return;
      }

      const inbox =
        modal === "whatsapp" ? waInbox : modal === "instagram" ? igInbox : emailInbox;
      if (!inbox) throw new Error("Channel is not available. Please try again later.");

      if (modal === "email") {
        await startOAuth("gmail", inbox.id, {
          clientId: values.clientId,
          clientSecret: values.clientSecret,
          pubsubTopic: values.pubsubTopic,
        });
        return;
      }
      if (modal === "instagram") {
        await startOAuth("instagram", inbox.id, {
          instagramAppId: values.instagramAppId,
          instagramAppSecret: values.instagramAppSecret,
          verifyToken: values.verifyToken,
        });
        return;
      }

      await updateInboxAsync({
        id: inbox.id,
        body: { channelConfig: values, enabled: true },
      });

      setBanner({ tone: "ok", text: "WhatsApp connected" });
      setModal(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (accountsLoading || inboxesLoading || shopifyLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const callbackChannels = [
    {
      name: "WhatsApp",
      urls: [{ label: "Webhook", value: oauthHints?.webhooks.whatsapp ?? waInbox?.webhookUrl }],
    },
    {
      name: "Instagram",
      urls: [
        { label: "Webhook", value: oauthHints?.webhooks.instagram ?? igInbox?.webhookUrl },
        { label: "Login redirect", value: oauthHints?.instagramRedirectUri },
      ],
    },
    {
      name: "Gmail",
      urls: [
        { label: "Push URL", value: oauthHints?.webhooks.emailPubSub ?? emailInbox?.webhookUrl },
        { label: "Login redirect", value: oauthHints?.gmailRedirectUri },
      ],
    },
  ];

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-8 pb-16 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect WhatsApp, Instagram, Gmail, and Shopify.
            </p>
          </div>
          <Button variant="outline" className="h-10 shrink-0 gap-2" asChild>
            <a href={setupGuidePdfUrl()} download="CEP-Channel-Setup-Guide.pdf">
              <Download className="h-4 w-4" />
              Download setup guide
            </a>
          </Button>
        </div>

        {banner && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              banner.tone === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200"
            }`}
          >
            {banner.text}
          </div>
        )}

        <CallbackUrlsCard channels={callbackChannels} />

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold leading-none">Channels</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              WhatsApp, Instagram, and Gmail.
            </p>
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <ChannelRow
              name="WhatsApp"
              linked={isLinkedStatus(waStatus.tone)}
              busy={
                (submitting && modal === "whatsapp") ||
                (disconnectingInbox && disconnectTarget === "whatsapp")
              }
              onConnect={() => setModal("whatsapp")}
              onDisconnect={() => setDisconnectTarget("whatsapp")}
            />
            <ChannelRow
              name="Instagram"
              linked={isLinkedStatus(igStatus.tone)}
              busy={
                connecting === "instagram" ||
                (submitting && modal === "instagram") ||
                (disconnectingInbox && disconnectTarget === "instagram")
              }
              onConnect={() => setModal("instagram")}
              onDisconnect={() => setDisconnectTarget("instagram")}
            />
            <ChannelRow
              name="Gmail"
              linked={isLinkedStatus(emailStatus.tone)}
              busy={
                connecting === "gmail" ||
                (submitting && modal === "email") ||
                (disconnectingInbox && disconnectTarget === "email")
              }
              onConnect={() => setModal("email")}
              onDisconnect={() => setDisconnectTarget("email")}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold leading-none">Shopify</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Customer and order details in the inbox.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <ChannelRow
              name="Shopify"
              linked={shopifyConnected}
              busy={
                (submitting && modal === "shopify") ||
                (shopifyBusy && disconnectTarget === "shopify")
              }
              onConnect={() => setModal("shopify")}
              onDisconnect={() => setDisconnectTarget("shopify")}
            />
          </div>
        </section>
      </div>

      {modal && modalConfig && (
        <ConnectModal
          title={modalConfig.title}
          description={modalConfig.description}
          fields={modalConfig.fields}
          initialValues={modalConfig.initialValues}
          submitting={submitting || connecting !== null}
          submitLabel={modalConfig.submitLabel}
          onClose={() => {
            if (submitting || connecting) return;
            setModal(null);
          }}
          onSubmit={handleConnectSubmit}
        />
      )}

      <ConfirmDialog
        open={Boolean(disconnectTarget)}
        title={`Disconnect ${disconnectLabel}?`}
        description={`This disconnects ${disconnectLabel}. You can connect again anytime.`}
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        destructive
        confirming={disconnectingInbox || (shopifyBusy && disconnectTarget === "shopify")}
        onConfirm={() => void handleDisconnectConfirm()}
        onCancel={() => setDisconnectTarget(null)}
      />
    </div>
  );
}
