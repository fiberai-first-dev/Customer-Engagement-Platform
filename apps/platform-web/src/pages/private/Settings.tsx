import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  startChannelOAuth,
  startGmailWatch,
  useAccounts,
  useInboxes,
  useOAuthHints,
  useShopifyConfig,
  useUpdateInbox,
  useUpdateShopifyConfig,
  setupGuidePdfUrl,
  type Inbox,
} from "../../api";
import {
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Radio,
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

const PUBLIC_PREFILL_KEYS = new Set([
  "phoneNumberId",
  "businessAccountId",
  "instagramAppId",
  "instagramUsername",
  "clientId",
  "pubsubTopic",
  "shop",
]);

function hasText(value?: string): boolean {
  return Boolean(value?.trim()) && value!.trim() !== "***";
}

function asStringRecord(config: Record<string, unknown> | undefined): Record<string, string> {
  if (!config) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value == null) continue;
    if (typeof value === "string") out[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
  }
  return out;
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
  if (health.level === "unknown") return { label: "Disabled", tone: "idle" };
  return { label: "Not Connected", tone: "idle" };
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "error" | "idle";
}) {
  const className =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-900"
        : tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`font-medium ${className}`}>
      {label}
    </Badge>
  );
}

function CallbackUrlsCard({
  rows,
}: {
  rows: { label: string; value?: string }[];
}) {
  const available = rows.filter((r) => Boolean(r.value));
  const [selected, setSelected] = useState(available[0]?.label ?? "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!available.some((r) => r.label === selected) && available[0]) {
      setSelected(available[0].label);
    }
  }, [available, selected]);

  const current = available.find((r) => r.label === selected) ?? available[0];
  if (!available.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="text-base font-semibold">Callback URLs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a URL to copy into Meta / Google when setting up channels.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label className="text-sm font-medium" htmlFor="callback-url-select">
            URL
          </label>
          <select
            id="callback-url-select"
            value={current?.label ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {available.map((row) => (
              <option key={row.label} value={row.label}>
                {row.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 gap-2"
          disabled={!current?.value}
          onClick={async () => {
            if (!current?.value) return;
            await navigator.clipboard.writeText(current.value);
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
      {current?.value && (
        <p className="mt-3 break-all rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
          {current.value}
        </p>
      )}
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
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 id="connect-modal-title" className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={submitting}
            className="h-8 w-8 rounded-full"
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
              Channel credentials
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
              Credentials are saved only on the server. They are never kept in the browser after
              Connect.
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
  status,
  busy,
  primaryLabel,
  onPrimary,
  secondary,
}: {
  name: string;
  status: { label: string; tone: "ok" | "warn" | "error" | "idle" };
  busy?: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-sm font-semibold text-foreground">{name}</span>
        <StatusBadge label={status.label} tone={status.tone} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {secondary}
        <Button type="button" onClick={onPrimary} disabled={busy} className="min-w-[7.5rem]">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {primaryLabel}
        </Button>
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
  const { data: shopify, isLoading: shopifyLoading } = useShopifyConfig();
  const { mutateAsync: updateShopifyAsync } = useUpdateShopifyConfig();

  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [connecting, setConnecting] = useState<"gmail" | "instagram" | null>(null);
  const [watching, setWatching] = useState(false);
  const [modal, setModal] = useState<ChannelKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  const shopifyConnected = Boolean(
    shopify?.shop?.trim() && shopify?.clientId?.trim() && shopify?.hasClientSecret,
  );
  const shopifyStatus = shopifyConnected
    ? { label: "Connected", tone: "ok" as const }
    : { label: "Not Connected", tone: "idle" as const };

  const connectedCount = [waStatus, igStatus, emailStatus, shopifyStatus].filter(
    (s) => s.tone === "ok",
  ).length;

  const gmailCanWatch =
    emailInbox?.health?.level === "ok" ||
    (emailInbox?.health?.level === "warn" &&
      Boolean(emailInbox.health.details.some((d) => /watch/i.test(d))));

  const startOAuth = async (provider: "gmail" | "instagram", inboxId: string) => {
    setConnecting(provider);
    setBanner({
      tone: "ok",
      text:
        provider === "gmail"
          ? "Opening Google to finish Gmail connection…"
          : "Opening Instagram to finish connection…",
    });
    try {
      const { url } = await startChannelOAuth(provider, inboxId);
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

  const publicPrefill = (config: Record<string, unknown> | undefined): Record<string, string> => {
    const raw = asStringRecord(config);
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!PUBLIC_PREFILL_KEYS.has(key)) continue;
      if (!hasText(value)) continue;
      out[key] = value;
    }
    return out;
  };

  const modalConfig = useMemo(() => {
    if (!modal) return null;
    if (modal === "whatsapp") {
      return {
        title: "Connect WhatsApp",
        description: "Enter your WhatsApp Business Cloud API credentials.",
        fields: WA_FIELDS,
        initialValues: publicPrefill(waInbox?.channelConfig as Record<string, unknown>),
        submitLabel: waStatus.tone === "ok" ? "Reconnect" : "Connect",
      };
    }
    if (modal === "instagram") {
      return {
        title: "Connect Instagram",
        description: "Enter app credentials. CEP opens Instagram login to finish.",
        fields: IG_FIELDS,
        initialValues: publicPrefill(igInbox?.channelConfig as Record<string, unknown>),
        submitLabel:
          connecting === "instagram"
            ? "Connecting…"
            : igStatus.tone === "ok"
              ? "Reconnect"
              : "Connect",
      };
    }
    if (modal === "email") {
      return {
        title: "Connect Gmail",
        description: "Enter OAuth client details. CEP opens Google to fill tokens.",
        fields: EMAIL_FIELDS,
        initialValues: publicPrefill(emailInbox?.channelConfig as Record<string, unknown>),
        submitLabel:
          connecting === "gmail"
            ? "Connecting…"
            : emailStatus.tone === "ok" || emailStatus.tone === "warn"
              ? "Reconnect"
              : "Connect",
      };
    }
    return {
      title: "Connect Shopify",
      description: "Connect your Shopify store for customer and order context.",
      fields: SHOPIFY_FIELDS,
      initialValues: {
        shop: shopify?.shop || "",
        clientId: shopify?.clientId || "",
      },
      submitLabel: shopifyConnected ? "Reconnect" : "Connect",
    };
  }, [
    modal,
    waInbox,
    igInbox,
    emailInbox,
    shopify,
    waStatus.tone,
    igStatus.tone,
    emailStatus.tone,
    shopifyConnected,
    connecting,
  ]);

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

      const channelConfig =
        modal === "instagram"
          ? {
              instagramAppId: values.instagramAppId,
              instagramAppSecret: values.instagramAppSecret,
              verifyToken: values.verifyToken,
              pageId: null,
              appSecret: null,
            }
          : values;

      await updateInboxAsync({
        id: inbox.id,
        body: { channelConfig, enabled: true },
      });

      if (modal === "email") {
        await startOAuth("gmail", inbox.id);
        return;
      }
      if (modal === "instagram") {
        await startOAuth("instagram", inbox.id);
        return;
      }

      setBanner({ tone: "ok", text: "WhatsApp connected" });
      setModal(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartWatch = async () => {
    if (!emailInbox) {
      setBanner({ tone: "err", text: "Email channel is not available." });
      return;
    }
    setWatching(true);
    try {
      const result = await startGmailWatch(emailInbox.id);
      await queryClient.invalidateQueries({ queryKey: ["inboxes"] });
      const expiresLabel = result.expiresAt
        ? new Date(result.expiresAt).toLocaleString()
        : null;
      setBanner({
        tone: "ok",
        text: expiresLabel
          ? `Gmail watch started · expires ${expiresLabel}`
          : "Gmail watch started",
      });
    } catch (err: unknown) {
      setBanner({
        tone: "err",
        text: err instanceof Error ? err.message : "Could not start Gmail watch",
      });
    } finally {
      setWatching(false);
    }
  };

  if (accountsLoading || inboxesLoading || shopifyLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const callbackRows = [
    { label: "WhatsApp webhook", value: oauthHints?.webhooks.whatsapp ?? waInbox?.webhookUrl },
    { label: "Instagram webhook", value: oauthHints?.webhooks.instagram ?? igInbox?.webhookUrl },
    { label: "Gmail push URL", value: oauthHints?.webhooks.emailPubSub ?? emailInbox?.webhookUrl },
    { label: "Gmail OAuth redirect", value: oauthHints?.gmailRedirectUri },
    { label: "Instagram OAuth redirect", value: oauthHints?.instagramRedirectUri },
  ];

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-background p-8">
      <div className="mx-auto w-full max-w-3xl space-y-8 pb-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1 text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">
              Connect messaging and commerce channels. Secrets stay on the server.
            </p>
          </div>
          <Button variant="outline" className="gap-2" asChild>
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

        <CallbackUrlsCard rows={callbackRows} />

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Channels</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect a channel, then manage it from this list.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">{connectedCount} connected</p>
          </div>

          <div className="space-y-2">
            <ChannelRow
              name="WhatsApp"
              status={waStatus}
              busy={submitting && modal === "whatsapp"}
              primaryLabel={waStatus.tone === "ok" ? "Reconnect" : "Connect"}
              onPrimary={() => setModal("whatsapp")}
            />
            <ChannelRow
              name="Instagram"
              status={igStatus}
              busy={connecting === "instagram" || (submitting && modal === "instagram")}
              primaryLabel={igStatus.tone === "ok" ? "Reconnect" : "Connect"}
              onPrimary={() => setModal("instagram")}
            />
            <ChannelRow
              name="Gmail"
              status={emailStatus}
              busy={connecting === "gmail" || (submitting && modal === "email")}
              primaryLabel={
                emailStatus.tone === "ok" || emailStatus.tone === "warn" ? "Reconnect" : "Connect"
              }
              onPrimary={() => setModal("email")}
              secondary={
                (emailStatus.tone === "ok" || emailStatus.tone === "warn") && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!gmailCanWatch || watching || connecting === "gmail"}
                    title={
                      gmailCanWatch
                        ? "Start Gmail push notifications"
                        : "Connect Gmail first"
                    }
                    onClick={() => void handleStartWatch()}
                  >
                    {watching ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Radio className="mr-2 h-4 w-4" />
                    )}
                    Start watch
                  </Button>
                )
              }
            />
            <ChannelRow
              name="Shopify"
              status={shopifyStatus}
              busy={submitting && modal === "shopify"}
              primaryLabel={shopifyConnected ? "Reconnect" : "Connect"}
              onPrimary={() => setModal("shopify")}
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
    </div>
  );
}
