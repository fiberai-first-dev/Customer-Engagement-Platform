import { useState } from "react";
import {
  MessageSquare,
  Users,
  Loader2,
  Inbox,
  TicketIcon,
  Clock,
  CheckCircle2,
  UserX,
  MessagesSquare,
  Mail,
} from "lucide-react";
import { useDashboardMetrics, type ChannelType } from "../../api";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../../utils/utils";
import { useNavigate } from "react-router-dom";

function channelLabel(channel: string) {
  switch (channel) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "email":
      return "Email";
    case "web_chat":
      return "Web Chat";
    default:
      return channel;
  }
}

function ChannelMark({ channel }: { channel?: string }) {
  const label = channelLabel(channel || "");
  const short =
    channel === "whatsapp"
      ? "WA"
      : channel === "instagram"
        ? "IG"
        : channel === "facebook"
          ? "FB"
          : channel === "email"
            ? "EM"
            : channel === "web_chat"
              ? "WC"
              : "?";
  return (
    <span
      title={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {short}
    </span>
  );
}

const TICKET_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-500",
  IN_PROGRESS: "bg-amber-500",
  ESCALATED: "bg-red-500",
  RESOLVED: "bg-emerald-500",
  CLOSED: "bg-slate-400",
};

const TICKET_STATUS_TEXT: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function DashboardPage() {
  const { data: dashboard, isLoading, isError, error } = useDashboardMetrics();
  const navigate = useNavigate();
  const [agingExpanded, setAgingExpanded] = useState(false);

  const totalTickets = Object.values(dashboard?.ticketsByStatus ?? {}).reduce(
    (a, b) => a + b,
    0,
  );
  const channelTotal = Object.values(dashboard?.channelDistribution ?? {}).reduce(
    (a, b) => a + b,
    0,
  );

  const metrics = [
    {
      title: "Open conversations",
      value: dashboard?.openConversations?.toLocaleString() ?? "—",
      icon: MessagesSquare,
      onClick: () => navigate("/inbox"),
    },
    {
      title: "Unresolved contacts",
      value: dashboard?.pendingConversations?.toLocaleString() ?? "—",
      icon: Inbox,
      onClick: () => navigate("/inbox"),
    },
    {
      title: "Unassigned tickets",
      value: dashboard?.unassignedTickets?.toLocaleString() ?? "—",
      icon: UserX,
      onClick: () => navigate("/tickets"),
    },
    {
      title: "Active contacts",
      value: dashboard?.activeContacts?.toLocaleString() ?? "—",
      icon: Users,
      onClick: () => navigate("/contacts"),
    },
    {
      title: "Messages",
      value: dashboard?.totalMessages?.toLocaleString() ?? "—",
      icon: MessageSquare,
    },
    {
      title: "Aging over 24h",
      value: dashboard?.agingConversations?.total?.toLocaleString() ?? "—",
      icon: Clock,
    },
  ];

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-background">
      <div className="border-b border-border bg-card px-6 py-5 sm:px-8">
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Snapshot of inbox load, tickets, and channel mix.
        </p>
      </div>

      <div className="mx-auto w-full max-w-6xl space-y-6 p-6 sm:p-8">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">Could not load dashboard</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(error as Error)?.message || "Try refreshing the page."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {metrics.map((m) => (
                <button
                  key={m.title}
                  type="button"
                  disabled={!m.onClick}
                  onClick={m.onClick}
                  className={cn(
                    "rounded-xl border border-border bg-card p-4 text-left transition-colors",
                    m.onClick && "hover:bg-muted/40",
                    !m.onClick && "cursor-default",
                  )}
                >
                  <m.icon className="mb-3 h-4 w-4 text-muted-foreground" />
                  <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                    {m.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{m.title}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <section className="rounded-xl border border-border bg-card lg:col-span-5">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Latest messages across channels
                    </p>
                  </div>
                  <Inbox className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="divide-y divide-border">
                  {(dashboard?.recentActivity ?? []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-muted-foreground">
                      <MessageSquare className="h-7 w-7 opacity-30" />
                      <p className="text-sm">No recent activity</p>
                    </div>
                  ) : (
                    (dashboard?.recentActivity ?? []).map((activity) => {
                      let when = "";
                      try {
                        when = formatDistanceToNow(new Date(activity.timestamp), {
                          addSuffix: true,
                        });
                      } catch {
                        when = "";
                      }
                      return (
                        <button
                          key={activity.id}
                          type="button"
                          className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-muted/30"
                          onClick={() => navigate("/inbox")}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                            {activity.initials || "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-foreground">
                                {activity.contactName}
                              </p>
                              <ChannelMark channel={activity.channelType} />
                              {when ? (
                                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                                  {when}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {activity.preview}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <div className="space-y-6 lg:col-span-7">
                <section className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Tickets by status</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {totalTickets.toLocaleString()} total
                      </p>
                    </div>
                    <TicketIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="p-5">
                    {totalTickets === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                        <CheckCircle2 className="h-7 w-7 opacity-30" />
                        <p className="text-sm">No tickets yet</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {Object.entries(dashboard?.ticketsByStatus ?? {}).map(([status, count]) => {
                          const pct = totalTickets
                            ? Math.round((count / totalTickets) * 100)
                            : 0;
                          return (
                            <button
                              key={status}
                              type="button"
                              className="rounded-lg border border-border p-3 text-left hover:bg-muted/30"
                              onClick={() => navigate("/tickets")}
                            >
                              <div className="mb-2 flex items-center gap-2">
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full",
                                    TICKET_STATUS_COLORS[status] ?? "bg-slate-400",
                                  )}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {TICKET_STATUS_TEXT[status] ?? status}
                                </span>
                              </div>
                              <p className="text-xl font-semibold tabular-nums text-foreground">
                                {count}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{pct}%</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {(dashboard?.ticketsByTeam ?? []).length > 0 && (
                  <section className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border px-5 py-4">
                      <h2 className="text-sm font-semibold text-foreground">Tickets by team</h2>
                    </div>
                    <div className="space-y-3 p-5">
                      {(dashboard?.ticketsByTeam ?? []).map((team) => {
                        const max = Math.max(
                          ...(dashboard?.ticketsByTeam ?? []).map((t) => t.count),
                          1,
                        );
                        const pct = Math.round((team.count / max) * 100);
                        return (
                          <div key={team.teamName} className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-foreground">{team.teamName}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {team.count}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-foreground/70"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Channel mix</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Message volume by channel</p>
                  </div>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="p-5">
                  {Object.keys(dashboard?.channelDistribution ?? {}).length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                      <MessageSquare className="h-7 w-7 opacity-30" />
                      <p className="text-sm">No channel data yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(dashboard?.channelDistribution ?? {}).map(
                        ([channel, count]) => {
                          const pct = channelTotal
                            ? Math.round((Number(count) / channelTotal) * 100)
                            : 0;
                          return (
                            <div key={channel} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-2 font-medium text-foreground">
                                  <ChannelMark channel={channel as ChannelType} />
                                  {channelLabel(channel)}
                                </span>
                                <span className="tabular-nums text-muted-foreground">
                                  {count as number} · {pct}%
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-foreground/70"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Aging conversations</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Unresolved chats waiting over 24 hours
                    </p>
                  </div>
                  {(dashboard?.agingConversations?.total ?? 0) > 0 ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
                      {dashboard?.agingConversations?.total}
                    </span>
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="p-5">
                  {(dashboard?.agingConversations?.total ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                      <CheckCircle2 className="h-7 w-7 opacity-30" />
                      <p className="text-sm">Nothing aging past 24h</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xl font-semibold tabular-nums text-foreground">
                            {dashboard?.agingConversations?.over24h ?? 0}
                          </p>
                          <p className="text-xs text-muted-foreground">24–48 hours</p>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xl font-semibold tabular-nums text-foreground">
                            {dashboard?.agingConversations?.over48h ?? 0}
                          </p>
                          <p className="text-xs text-muted-foreground">Over 48 hours</p>
                        </div>
                      </div>

                      {(dashboard?.agingConversations?.sample ?? []).length > 0 && (
                        <div className="divide-y divide-border rounded-lg border border-border">
                          {(dashboard?.agingConversations?.sample ?? [])
                            .slice(0, agingExpanded ? undefined : 4)
                            .map((item) => (
                              <button
                                key={item.conversationId}
                                type="button"
                                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
                                onClick={() => navigate("/inbox")}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <ChannelMark channel={item.channelType} />
                                  <span className="truncate text-xs font-medium text-foreground">
                                    {item.contactName}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                  {item.ageHours}h
                                </span>
                              </button>
                            ))}
                          {(dashboard?.agingConversations?.sample ?? []).length > 4 && (
                            <button
                              type="button"
                              onClick={() => setAgingExpanded((p) => !p)}
                              className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted/30"
                            >
                              {agingExpanded
                                ? "Show less"
                                : `Show ${(dashboard?.agingConversations?.sample ?? []).length - 4} more`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
