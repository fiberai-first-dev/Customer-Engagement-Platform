import { useState, useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  startChannelOAuth,
  startGmailWatch,
  useAccounts,
  useInboxes,
  useOAuthHints,
  useShopifyConfig,
  useUpdateInbox,
  useUpdateShopifyConfig,
} from "../../api";
import { CheckCircle2, Copy, Link2, Loader2, Radio, Save } from "lucide-react";

type SettingsTab = "channels" | "shopify";

type Field = {
  key: string;
  label: string;
  placeholder?: string;
};

const EMPTY_WA = {
  phoneNumberId: "",
  accessToken: "",
  verifyToken: "",
  appSecret: "",
  businessAccountId: "",
};

const EMPTY_IG = {
  pageId: "",
  accessToken: "",
  verifyToken: "",
  appSecret: "",
  instagramAppId: "",
  instagramUsername: "",
};

const EMPTY_EMAIL = {
  clientId: "",
  clientSecret: "",
  refreshToken: "",
  accessToken: "",
  pubsubTopic: "",
};

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

function FieldGrid({
  fields,
  values,
  onChange,
}: {
  fields: Field[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map((field) => (
        <div key={field.key} className="grid gap-1.5">
          <label className="text-sm font-medium">{field.label}</label>
          <Input
            type="text"
            value={values[field.key] ?? ""}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      ))}
    </div>
  );
}

function ChannelCard({
  title,
  description,
  enabled,
  onToggleEnabled,
  children,
  onSave,
  saving,
  busy,
  footer,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggleEnabled: (next: boolean) => void;
  children: ReactNode;
  onSave: () => void;
  saving: boolean;
  busy?: boolean;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => onToggleEnabled(e.target.checked)}
            />
            Enabled
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {children}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onSave} disabled={busy}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          {footer}
        </div>
      </CardContent>
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-all font-mono text-xs text-foreground">{value}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 gap-1.5 px-2"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function tabFromSearch(params: URLSearchParams): SettingsTab {
  const t = params.get("tab");
  if (t === "shopify" || t === "channels") return t;
  return "channels";
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromSearch(searchParams);
  const setTab = (next: SettingsTab) => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", next);
    setSearchParams(p, { replace: true });
  };

  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const activeAccount = accounts?.[0];
  const { data: inboxes, isLoading: inboxesLoading } = useInboxes(activeAccount?.id);
  const { data: oauthHints } = useOAuthHints();
  const { mutate: updateInbox } = useUpdateInbox();
  const { data: shopify, isLoading: shopifyLoading } = useShopifyConfig();
  const { mutate: updateShopify, isPending: shopifySaving } = useUpdateShopifyConfig();

  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [connecting, setConnecting] = useState<"gmail" | "instagram" | null>(null);
  const [watching, setWatching] = useState(false);
  const [pendingChannel, setPendingChannel] = useState<"whatsapp" | "instagram" | "email" | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<"save" | "toggle" | null>(null);

  const [waConfig, setWaConfig] = useState<Record<string, string>>(EMPTY_WA);
  const [igConfig, setIgConfig] = useState<Record<string, string>>(EMPTY_IG);
  const [emailConfig, setEmailConfig] = useState<Record<string, string>>(EMPTY_EMAIL);
  const [shopifyForm, setShopifyForm] = useState({
    shop: "",
    clientId: "",
    clientSecret: "",
  });

  useEffect(() => {
    if (!inboxes) return;
    const wa = inboxes.find((i) => i.channelType === "whatsapp");
    setWaConfig({ ...EMPTY_WA, ...asStringRecord(wa?.channelConfig as Record<string, unknown>) });
    const ig = inboxes.find((i) => i.channelType === "instagram");
    setIgConfig({ ...EMPTY_IG, ...asStringRecord(ig?.channelConfig as Record<string, unknown>) });
    const em = inboxes.find((i) => i.channelType === "email");
    setEmailConfig({
      ...EMPTY_EMAIL,
      ...asStringRecord(em?.channelConfig as Record<string, unknown>),
    });
  }, [inboxes]);

  useEffect(() => {
    if (!shopify) return;
    setShopifyForm({
      shop: shopify.shop || "",
      clientId: shopify.clientId || "",
      clientSecret: shopify.clientSecret || "",
    });
  }, [shopify]);

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    const status = searchParams.get("status");
    if (!oauth || !status) return;

    if (status === "success") {
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
    ["oauth", "status", "message", "email", "username"].forEach((k) => next.delete(k));
    next.set("tab", "channels");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const waInbox = inboxes?.find((i) => i.channelType === "whatsapp");
  const igInbox = inboxes?.find((i) => i.channelType === "instagram");
  const emailInbox = inboxes?.find((i) => i.channelType === "email");

  const handleSave = (
    channelType: "whatsapp" | "instagram" | "email",
    config: Record<string, string>,
    enabled?: boolean,
  ) => {
    const inbox = inboxes?.find((i) => i.channelType === channelType);
    if (!inbox) {
      setBanner({ tone: "err", text: "Channel is not available. Please try again later." });
      return;
    }
    setPendingChannel(channelType);
    setPendingAction("save");
    updateInbox(
      {
        id: inbox.id,
        body: {
          channelConfig: config,
          enabled: enabled ?? inbox.enabled,
        },
      },
      {
        onSuccess: () => setBanner({ tone: "ok", text: "Saved" }),
        onError: (err) => setBanner({ tone: "err", text: err.message }),
        onSettled: () => {
          setPendingChannel(null);
          setPendingAction(null);
        },
      },
    );
  };

  const handleToggleEnabled = (
    channelType: "whatsapp" | "instagram" | "email",
    enabled: boolean,
  ) => {
    const inbox = inboxes?.find((i) => i.channelType === channelType);
    if (!inbox) return;
    setPendingChannel(channelType);
    setPendingAction("toggle");
    updateInbox(
      { id: inbox.id, body: { enabled } },
      {
        onSuccess: () =>
          setBanner({
            tone: "ok",
            text: `${channelType} ${enabled ? "enabled" : "disabled"}`,
          }),
        onError: (err) => setBanner({ tone: "err", text: err.message }),
        onSettled: () => {
          setPendingChannel(null);
          setPendingAction(null);
        },
      },
    );
  };

  const isSaving = (channel: "whatsapp" | "instagram" | "email") =>
    pendingChannel === channel && pendingAction === "save";
  const isChannelBusy = (channel: "whatsapp" | "instagram" | "email") =>
    pendingChannel === channel;

  const handleConnect = async (provider: "gmail" | "instagram") => {
    const inbox = provider === "gmail" ? emailInbox : igInbox;
    if (!inbox) {
      setBanner({ tone: "err", text: "Channel is not available. Please try again later." });
      return;
    }
    setConnecting(provider);
    try {
      const { url } = await startChannelOAuth(provider, inbox.id);
      window.location.href = url;
    } catch (err: any) {
      setBanner({ tone: "err", text: err?.message ?? "Could not start connection" });
      setConnecting(null);
    }
  };

  const handleStartWatch = async () => {
    if (!emailInbox) {
      setBanner({ tone: "err", text: "Email channel is not available. Please try again later." });
      return;
    }
    setWatching(true);
    try {
      await startGmailWatch(emailInbox.id);
      setBanner({ tone: "ok", text: "Gmail watch started" });
    } catch (err: any) {
      setBanner({ tone: "err", text: err?.message ?? "Could not start Gmail watch" });
    } finally {
      setWatching(false);
    }
  };

  if (accountsLoading || inboxesLoading || (tab === "shopify" && shopifyLoading)) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "channels", label: "Channels" },
    { id: "shopify", label: "Shopify" },
  ];

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-background p-8">
      <div className="mx-auto w-full max-w-4xl space-y-8 pb-12">
        <div>
          <h1 className="mb-1 text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage channels and Shopify integration.</p>
        </div>

        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
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

        {tab === "channels" && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Callback URLs</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <CopyRow label="WhatsApp webhook" value={waInbox?.webhookUrl ?? oauthHints?.webhooks.whatsapp} />
                <CopyRow label="Instagram webhook" value={igInbox?.webhookUrl ?? oauthHints?.webhooks.instagram} />
                <CopyRow label="Gmail push URL" value={oauthHints?.webhooks.emailPubSub} />
                <CopyRow label="Gmail OAuth redirect" value={oauthHints?.gmailRedirectUri} />
                <CopyRow label="Instagram OAuth redirect" value={oauthHints?.instagramRedirectUri} />
              </CardContent>
            </Card>

            <ChannelCard
              title="WhatsApp"
              description="Connect your WhatsApp Business number."
              enabled={waInbox?.enabled ?? false}
              onToggleEnabled={(v) => handleToggleEnabled("whatsapp", v)}
              saving={isSaving("whatsapp")}
              busy={isChannelBusy("whatsapp")}
              onSave={() => handleSave("whatsapp", waConfig, true)}
            >
              <FieldGrid
                values={waConfig}
                onChange={(key, value) => setWaConfig((prev) => ({ ...prev, [key]: value }))}
                fields={[
                  { key: "phoneNumberId", label: "Phone Number ID" },
                  { key: "accessToken", label: "Access Token" },
                  { key: "verifyToken", label: "Verify Token" },
                  { key: "appSecret", label: "App Secret" },
                  { key: "businessAccountId", label: "Business Account ID" },
                ]}
              />
            </ChannelCard>

            <ChannelCard
              title="Instagram"
              description="Connect Instagram Messaging for your business account."
              enabled={igInbox?.enabled ?? false}
              onToggleEnabled={(v) => handleToggleEnabled("instagram", v)}
              saving={isSaving("instagram")}
              busy={isChannelBusy("instagram")}
              onSave={() => handleSave("instagram", igConfig, true)}
              footer={
                <Button
                  type="button"
                  variant="secondary"
                  disabled={connecting === "instagram" || isChannelBusy("instagram")}
                  onClick={() => void handleConnect("instagram")}
                >
                  {connecting === "instagram" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  Connect Instagram
                </Button>
              }
            >
              <FieldGrid
                values={igConfig}
                onChange={(key, value) => setIgConfig((prev) => ({ ...prev, [key]: value }))}
                fields={[
                  { key: "instagramAppId", label: "App ID" },
                  { key: "appSecret", label: "App Secret" },
                  { key: "verifyToken", label: "Verify Token" },
                  { key: "accessToken", label: "Access Token" },
                  { key: "pageId", label: "Page / User ID" },
                  { key: "instagramUsername", label: "Username" },
                ]}
              />
            </ChannelCard>

            <ChannelCard
              title="Gmail"
              description="Connect Gmail for email conversations."
              enabled={emailInbox?.enabled ?? false}
              onToggleEnabled={(v) => handleToggleEnabled("email", v)}
              saving={isSaving("email")}
              busy={isChannelBusy("email")}
              onSave={() => handleSave("email", emailConfig, true)}
              footer={
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={connecting === "gmail" || isChannelBusy("email")}
                    onClick={() => void handleConnect("gmail")}
                  >
                    {connecting === "gmail" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="mr-2 h-4 w-4" />
                    )}
                    Connect Gmail
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={watching || isChannelBusy("email")}
                    onClick={() => void handleStartWatch()}
                  >
                    {watching ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Radio className="mr-2 h-4 w-4" />
                    )}
                    Start watch
                  </Button>
                </>
              }
            >
              <FieldGrid
                values={emailConfig}
                onChange={(key, value) => setEmailConfig((prev) => ({ ...prev, [key]: value }))}
                fields={[
                  { key: "clientId", label: "Client ID" },
                  { key: "clientSecret", label: "Client Secret" },
                  { key: "pubsubTopic", label: "Pub/Sub Topic", placeholder: "projects/…/topics/…" },
                  { key: "refreshToken", label: "Refresh Token" },
                  { key: "accessToken", label: "Access Token" },
                ]}
              />
            </ChannelCard>
          </>
        )}

        {tab === "shopify" && (
          <Card>
            <CardHeader>
              <CardTitle>Shopify</CardTitle>
              <CardDescription>
                Connect your Shopify store to show customer and order details in the inbox.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGrid
                values={shopifyForm}
                onChange={(key, value) => setShopifyForm((prev) => ({ ...prev, [key]: value }))}
                fields={[
                  { key: "shop", label: "Shop subdomain", placeholder: "mystore" },
                  { key: "clientId", label: "Client ID" },
                  { key: "clientSecret", label: "Client Secret" },
                ]}
              />
              <Button
                disabled={shopifySaving}
                onClick={() =>
                  updateShopify(
                    {
                      shop: shopifyForm.shop,
                      clientId: shopifyForm.clientId,
                      clientSecret: shopifyForm.clientSecret,
                    },
                    {
                      onSuccess: () => setBanner({ tone: "ok", text: "Shopify settings saved" }),
                      onError: (err) => setBanner({ tone: "err", text: err.message }),
                    },
                  )
                }
              >
                {shopifySaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
