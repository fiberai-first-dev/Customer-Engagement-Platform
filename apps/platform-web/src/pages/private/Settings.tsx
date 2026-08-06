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
  useUpdateInbox,
} from "../../api";
import { CheckCircle2, ExternalLink, Link2, Loader2, Radio, Save } from "lucide-react";

type Field = {
  key: string;
  label: string;
  envHint: string;
  password?: boolean;
  placeholder?: string;
};

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
            type={field.password ? "password" : "text"}
            value={values[field.key] ?? ""}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            onFocus={(e) => {
              if (e.target.value === "***") onChange(field.key, "");
            }}
          />
          <p className="text-[11px] text-muted-foreground">env: {field.envHint}</p>
        </div>
      ))}
    </div>
  );
}

function ChannelCard({
  title,
  description,
  children,
  onSave,
  saving,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onSave: () => void;
  saving: boolean;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {children}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save {title}
          </Button>
          {footer}
        </div>
      </CardContent>
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <button
        type="button"
        className="mt-1 break-all text-left font-mono text-xs text-foreground hover:underline"
        title="Click to copy"
        onClick={() => {
          void navigator.clipboard.writeText(value);
        }}
      >
        {value}
      </button>
    </div>
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const activeAccount = accounts?.[0];
  const { data: inboxes, isLoading: inboxesLoading } = useInboxes(activeAccount?.id);
  const { data: oauthHints } = useOAuthHints();
  const { mutate: updateInbox, isPending } = useUpdateInbox();

  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [connecting, setConnecting] = useState<"gmail" | "instagram" | null>(null);
  const [watching, setWatching] = useState(false);

  const [waConfig, setWaConfig] = useState<Record<string, string>>({
    phoneNumberId: "",
    accessToken: "",
    verifyToken: "",
    appSecret: "",
    businessAccountId: "",
  });
  const [igConfig, setIgConfig] = useState<Record<string, string>>({
    pageId: "",
    accessToken: "",
    verifyToken: "",
    appSecret: "",
    instagramAppId: "",
    instagramUsername: "",
  });
  const [emailConfig, setEmailConfig] = useState<Record<string, string>>({
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    accessToken: "",
    pubsubTopic: "",
  });

  useEffect(() => {
    if (!inboxes) return;
    const wa = inboxes.find((i) => i.channelType === "whatsapp");
    if (wa?.channelConfig) setWaConfig((prev) => ({ ...prev, ...(wa.channelConfig as object) }));
    const ig = inboxes.find((i) => i.channelType === "instagram");
    if (ig?.channelConfig) setIgConfig((prev) => ({ ...prev, ...(ig.channelConfig as object) }));
    const em = inboxes.find((i) => i.channelType === "email");
    if (em?.channelConfig) setEmailConfig((prev) => ({ ...prev, ...(em.channelConfig as object) }));
  }, [inboxes]);

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    const status = searchParams.get("status");
    if (!oauth || !status) return;

    if (status === "success") {
      const detail =
        oauth === "gmail"
          ? searchParams.get("email")
            ? ` Connected as ${searchParams.get("email")}.`
            : " Refresh + access tokens saved to this inbox."
          : searchParams.get("username")
            ? ` Connected as @${searchParams.get("username")}.`
            : " Long-lived access token saved to this inbox.";
      setBanner({ tone: "ok", text: `${oauth === "gmail" ? "Gmail" : "Instagram"} connected.${detail}` });
    } else {
      setBanner({
        tone: "err",
        text: `${oauth === "gmail" ? "Gmail" : "Instagram"} connect failed: ${searchParams.get("message") || "unknown error"}`,
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete("oauth");
    next.delete("status");
    next.delete("message");
    next.delete("email");
    next.delete("username");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const waInbox = inboxes?.find((i) => i.channelType === "whatsapp");
  const igInbox = inboxes?.find((i) => i.channelType === "instagram");
  const emailInbox = inboxes?.find((i) => i.channelType === "email");

  const handleSave = (channelType: "whatsapp" | "instagram" | "email", config: Record<string, string>) => {
    const inbox = inboxes?.find((i) => i.channelType === channelType);
    if (!inbox) {
      alert("Inbox not found for this channel. Run backend seed first.");
      return;
    }
    const cleanConfig = Object.fromEntries(
      Object.entries(config).filter(([, v]) => v !== "***" && v !== undefined),
    );
    updateInbox(
      { id: inbox.id, body: { channelConfig: cleanConfig } },
      {
        onSuccess: () => {
          setBanner({ tone: "ok", text: `${channelType} settings saved.` });
        },
        onError: (err) => {
          setBanner({ tone: "err", text: `Failed to save: ${err.message}` });
        },
      },
    );
  };

  const handleConnect = async (provider: "gmail" | "instagram") => {
    const inbox = provider === "gmail" ? emailInbox : igInbox;
    if (!inbox) {
      alert("Inbox not found. Run backend seed first.");
      return;
    }
    setConnecting(provider);
    try {
      const { url } = await startChannelOAuth(provider, inbox.id);
      window.location.href = url;
    } catch (err: any) {
      setBanner({
        tone: "err",
        text: err?.message ?? `Failed to start ${provider} connect`,
      });
      setConnecting(null);
    }
  };

  const handleStartWatch = async () => {
    if (!emailInbox) {
      alert("Email inbox not found.");
      return;
    }
    setWatching(true);
    try {
      await startGmailWatch(emailInbox.id);
      setBanner({
        tone: "ok",
        text: "Gmail watch started. New mail will push via Pub/Sub to the webhook URL above.",
      });
    } catch (err: any) {
      setBanner({ tone: "err", text: err?.message ?? "Failed to start Gmail watch" });
    } finally {
      setWatching(false);
    }
  };

  if (accountsLoading || inboxesLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-background p-8">
      <div className="mx-auto w-full max-w-4xl space-y-8 pb-12">
        <div>
          <h1 className="mb-2 text-3xl font-bold">Channel settings</h1>
          <p className="text-muted-foreground">
            Paste provider credentials here. For Gmail and Instagram tokens, use{" "}
            <strong>Connect</strong> — no local CLI required. Values saved here override server env
            for that inbox. Secrets show as *** until you replace them.
          </p>
        </div>

        {banner && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
              banner.tone === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200"
            }`}
          >
            {banner.tone === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>{banner.text}</p>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Webhook & OAuth URLs</CardTitle>
            <CardDescription>
              Copy these into Meta / Google consoles. Click a URL to copy.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <CopyRow label="WhatsApp webhook" value={waInbox?.webhookUrl ?? oauthHints?.webhooks.whatsapp} />
            <CopyRow label="Instagram webhook" value={igInbox?.webhookUrl ?? oauthHints?.webhooks.instagram} />
            <CopyRow label="Gmail Pub/Sub push" value={oauthHints?.webhooks.emailPubSub} />
            <CopyRow
              label="Gmail OAuth redirect (add in Google Cloud)"
              value={oauthHints?.gmailRedirectUri}
            />
            <CopyRow
              label="Instagram OAuth redirect (add in Meta)"
              value={oauthHints?.instagramRedirectUri}
            />
          </CardContent>
        </Card>

        <ChannelCard
          title="WhatsApp"
          description="Cloud API credentials used for send + webhook verify. Tokens are pasted from Meta (no OAuth button)."
          saving={isPending}
          onSave={() => handleSave("whatsapp", waConfig)}
        >
          <FieldGrid
            values={waConfig}
            onChange={(key, value) => setWaConfig((prev) => ({ ...prev, [key]: value }))}
            fields={[
              { key: "phoneNumberId", label: "Phone Number ID", envHint: "WHATSAPP_PHONE_NUMBER_ID" },
              {
                key: "accessToken",
                label: "Access Token",
                envHint: "WHATSAPP_ACCESS_TOKEN",
                password: true,
              },
              { key: "verifyToken", label: "Verify Token", envHint: "WHATSAPP_VERIFY_TOKEN" },
              {
                key: "appSecret",
                label: "App Secret",
                envHint: "WHATSAPP_APP_SECRET",
                password: true,
              },
              {
                key: "businessAccountId",
                label: "Business Account ID",
                envHint: "WHATSAPP_BUSINESS_ACCOUNT_ID",
              },
            ]}
          />
        </ChannelCard>

        <ChannelCard
          title="Instagram"
          description="Save App ID + App Secret (+ verify token), then Connect to obtain a long-lived access token in the browser."
          saving={isPending}
          onSave={() => handleSave("instagram", igConfig)}
          footer={
            <Button
              type="button"
              variant="secondary"
              disabled={connecting === "instagram" || isPending}
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
              { key: "pageId", label: "Page / User ID", envHint: "INSTAGRAM_PAGE_ID" },
              {
                key: "accessToken",
                label: "Access Token (filled by Connect)",
                envHint: "INSTAGRAM_ACCESS_TOKEN",
                password: true,
              },
              { key: "verifyToken", label: "Verify Token", envHint: "INSTAGRAM_VERIFY_TOKEN" },
              {
                key: "appSecret",
                label: "App Secret",
                envHint: "INSTAGRAM_APP_SECRET",
                password: true,
              },
              { key: "instagramAppId", label: "App ID", envHint: "INSTAGRAM_APP_ID" },
              { key: "instagramUsername", label: "Username", envHint: "INSTAGRAM_USERNAME" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            Before Connect: add{" "}
            <code className="rounded bg-muted px-1">{oauthHints?.instagramRedirectUri ?? "…/oauth/instagram/callback"}</code>{" "}
            as an Exact OAuth redirect URI in Meta Business Login settings. Save App ID + Secret first.
          </p>
        </ChannelCard>

        <ChannelCard
          title="Gmail / Email"
          description="Save Client ID + Client Secret + Pub/Sub topic, then Connect Gmail. Tokens are written automatically — no npm run gmail:oauth."
          saving={isPending}
          onSave={() => handleSave("email", emailConfig)}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={connecting === "gmail" || isPending}
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
                disabled={watching || isPending}
                onClick={() => void handleStartWatch()}
              >
                {watching ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Radio className="mr-2 h-4 w-4" />
                )}
                Start Gmail watch
              </Button>
            </>
          }
        >
          <FieldGrid
            values={emailConfig}
            onChange={(key, value) => setEmailConfig((prev) => ({ ...prev, [key]: value }))}
            fields={[
              { key: "clientId", label: "Client ID", envHint: "GMAIL_CLIENT_ID" },
              {
                key: "clientSecret",
                label: "Client Secret",
                envHint: "GMAIL_CLIENT_SECRET",
                password: true,
              },
              {
                key: "refreshToken",
                label: "Refresh Token (filled by Connect)",
                envHint: "GMAIL_REFRESH_TOKEN",
                password: true,
              },
              {
                key: "accessToken",
                label: "Access Token (filled by Connect)",
                envHint: "GMAIL_ACCESS_TOKEN",
                password: true,
              },
              { key: "pubsubTopic", label: "Pub/Sub Topic", envHint: "GMAIL_PUBSUB_TOPIC" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            Before Connect: add{" "}
            <code className="rounded bg-muted px-1">{oauthHints?.gmailRedirectUri ?? "…/oauth/gmail/callback"}</code>{" "}
            as an Authorized redirect URI on your Google OAuth Web client. Sign in as the mailbox that should receive support email.
          </p>
        </ChannelCard>
      </div>
    </div>
  );
}
