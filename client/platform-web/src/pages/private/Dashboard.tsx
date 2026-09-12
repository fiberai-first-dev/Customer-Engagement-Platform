import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import {
  MessageSquare,
  Users,
  Loader2,
  Activity,
  Inbox,
  TicketIcon,
  Clock,
  CheckCircle2,
  UserX,
  MessagesSquare,
} from "lucide-react";
import { useDashboardMetrics } from "../../api";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../../utils/utils";
import { useNavigate } from "react-router-dom";

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: "💬",
  instagram: "📸",
  facebook: "📘",
  email: "✉️",
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-500",
  IN_PROGRESS: "bg-amber-500",
  ESCALATED: "bg-red-500",
  RESOLVED: "bg-emerald-500",
  CLOSED: "bg-slate-400",
};

const TICKET_STATUS_TEXT: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function DashboardPage() {
  const { data: dashboard, isLoading } = useDashboardMetrics();
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
      title: "Open Conversations",
      value: dashboard?.openConversations?.toLocaleString() ?? "0",
      icon: MessagesSquare,
      color: "text-blue-600",
      bg: "bg-blue-100 dark:bg-blue-900/30",
      action: () => navigate("/inbox?status=active"),
    },
    {
      title: "Pending (Unassigned)",
      value: dashboard?.pendingConversations?.toLocaleString() ?? "0",
      icon: Inbox,
      color: "text-amber-600",
      bg: "bg-amber-100 dark:bg-amber-900/30",
      action: () => navigate("/inbox?status=active"),
    },
    {
      title: "Unassigned Tickets",
      value: dashboard?.unassignedTickets?.toLocaleString() ?? "0",
      icon: UserX,
      color: "text-red-600",
      bg: "bg-red-100 dark:bg-red-900/30",
      action: () => navigate("/tickets"),
    },
    {
      title: "Active Contacts",
      value: dashboard?.activeContacts?.toLocaleString() ?? "0",
      icon: Users,
      color: "text-emerald-600",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      action: () => navigate("/contacts"),
    },
    {
      title: "Total Messages",
      value: dashboard?.totalMessages?.toLocaleString() ?? "0",
      icon: MessageSquare,
      color: "text-violet-600",
      bg: "bg-violet-100 dark:bg-violet-900/30",
    },
    {
      title: "Aging (>24h)",
      value: dashboard?.agingConversations?.total?.toLocaleString() ?? "0",
      icon: Clock,
      color: "text-orange-600",
      bg: "bg-orange-100 dark:bg-orange-900/30",
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-background">
      <div className="border-b border-border bg-card px-8 py-5">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of active conversations and tickets.
        </p>
      </div>

      <div className="max-w-7xl w-full mx-auto p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center p-12 bg-card rounded-2xl shadow-sm border border-border/50">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* 6-metric KPI grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {metrics.map((m, i) => (
                <Card
                  key={i}
                  className={cn(
                    "shadow-sm border-border/50 hover:shadow-md transition-all duration-200 bg-card/80 backdrop-blur-sm",
                    m.action && "cursor-pointer hover:-translate-y-0.5",
                  )}
                  onClick={m.action}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center",
                          m.bg,
                          m.color,
                        )}
                      >
                        <m.icon className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold tracking-tight text-foreground">
                          {m.value}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground mt-0.5 leading-tight">
                          {m.title}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Recent Activity */}
              <Card className="lg:col-span-5 shadow-sm border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="border-b border-border/50 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Recent Activity</CardTitle>
                      <CardDescription className="mt-0.5 text-xs">Latest messages across channels.</CardDescription>
                    </div>
                    <div className="p-1.5 bg-primary/10 rounded-full text-primary">
                      <Inbox className="w-4 h-4" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 px-4 pb-2">
                  <div className="space-y-3">
                    {(dashboard?.recentActivity ?? []).length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <MessageSquare className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-sm font-medium">No recent activity</p>
                      </div>
                    )}
                    {(dashboard?.recentActivity ?? []).map((activity) => (
                      <div
                        key={activity.id}
                        className="group flex items-center gap-3 p-2.5 -mx-2 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => navigate("/inbox")}
                      >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center font-bold text-xs shadow-sm border border-primary/10 shrink-0">
                          {activity.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-0.5">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {activity.contactName}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {activity.channelType && (
                                <span className="text-sm" title={activity.channelType}>
                                  {CHANNEL_ICONS[activity.channelType] ?? "💬"}
                                </span>
                              )}
                              <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap bg-muted px-1.5 py-0.5 rounded-full">
                                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground truncate leading-relaxed">
                            {activity.preview}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Right column: Tickets by Status + Channel Mix */}
              <div className="lg:col-span-7 space-y-6">
                {/* Ticket backlog by status */}
                <Card className="shadow-sm border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader className="border-b border-border/50 pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Ticket Backlog by Status</CardTitle>
                        <CardDescription className="mt-0.5 text-xs">
                          {totalTickets.toLocaleString()} total tickets
                        </CardDescription>
                      </div>
                      <div className="p-1.5 bg-primary/10 rounded-full text-primary">
                        <TicketIcon className="w-4 h-4" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {totalTickets === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                        <CheckCircle2 className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">No open tickets</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(dashboard?.ticketsByStatus ?? {}).map(([status, count]) => {
                          const pct = totalTickets ? Math.round((count / totalTickets) * 100) : 0;
                          return (
                            <div
                              key={status}
                              className="flex-1 min-w-[100px] rounded-xl border border-border/60 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                              onClick={() => navigate("/tickets")}
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className={cn("w-2.5 h-2.5 rounded-full", TICKET_STATUS_COLORS[status] ?? "bg-slate-400")} />
                                <span className="text-xs font-medium text-muted-foreground">{TICKET_STATUS_TEXT[status] ?? status}</span>
                              </div>
                              <p className="text-xl font-bold text-foreground">{count}</p>
                              <p className="text-[10px] text-muted-foreground">{pct}% of total</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tickets by Team */}
                {((dashboard?.ticketsByTeam as any) ?? []).length > 0 && (
                  <Card className="shadow-sm border-border/50 bg-card/80 backdrop-blur-sm">
                    <CardHeader className="border-b border-border/50 pb-3">
                      <CardTitle className="text-base">Tickets by Team</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        {((dashboard?.ticketsByTeam as any) ?? []).map((team: any) => {
                          const max = Math.max(...((dashboard?.ticketsByTeam as any) ?? []).map((t: any) => t.count), 1);
                          const pct = Math.round((team.count / max) * 100);
                          return (
                            <div key={team.teamName} className="space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium text-foreground">{team.teamName}</span>
                                <span className="text-muted-foreground font-medium">{team.count}</span>
                              </div>
                              <div className="w-full h-2 bg-muted/60 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-700"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Channel Mix + Aging conversations row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Channel Mix */}
              <Card className="shadow-sm border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="border-b border-border/50 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Channel Mix</CardTitle>
                      <CardDescription className="mt-0.5 text-xs">Message volume by channel.</CardDescription>
                    </div>
                    <div className="p-1.5 bg-primary/10 rounded-full text-primary">
                      <Activity className="w-4 h-4" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {Object.keys(dashboard?.channelDistribution ?? {}).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[120px] text-muted-foreground">
                      <Activity className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-sm">No channel data</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(dashboard?.channelDistribution ?? {}).map(([channel, count]) => {
                        const pct = channelTotal ? Math.round((Number(count) / channelTotal) * 100) : 0;
                        return (
                          <div key={channel} className="space-y-1.5">
                            <div className="flex justify-between items-end text-xs">
                              <span className="flex items-center gap-1.5 font-semibold capitalize text-foreground">
                                <span>{CHANNEL_ICONS[channel] ?? "💬"}</span>
                                {channel}
                              </span>
                              <span className="text-muted-foreground font-medium">{count as number} · {pct}%</span>
                            </div>
                            <div className="w-full h-2 bg-muted/70 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-1000"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Aging Conversations */}
              <Card className="shadow-sm border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="border-b border-border/50 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4 text-orange-500" />
                        Aging Conversations
                      </CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        Open chats with no reply in the last 24h.
                      </CardDescription>
                    </div>
                    {(dashboard?.agingConversations?.total ?? 0) > 0 && (
                      <span className="text-xs font-bold text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
                        {dashboard?.agingConversations?.total} total
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {(dashboard?.agingConversations?.total ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[120px] text-muted-foreground">
                      <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-400 opacity-60" />
                      <p className="text-sm font-medium">All conversations up to date</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Bucket summary */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                          <p className="text-xl font-bold text-amber-700 dark:text-amber-400">
                            {dashboard?.agingConversations?.over24h ?? 0}
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-500">24–48h old</p>
                        </div>
                        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                          <p className="text-xl font-bold text-red-700 dark:text-red-400">
                            {dashboard?.agingConversations?.over48h ?? 0}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-500">48h+ old</p>
                        </div>
                      </div>

                      {/* Sample list */}
                      {(dashboard?.agingConversations?.sample ?? []).length > 0 && (
                        <div className="space-y-1">
                          {(dashboard?.agingConversations?.sample ?? [])
                            .slice(0, agingExpanded ? undefined : 3)
                            .map((item) => (
                              <div
                                key={item.conversationId}
                                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => navigate("/inbox")}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm">{CHANNEL_ICONS[item.channelType] ?? "💬"}</span>
                                  <span className="text-xs font-medium text-foreground truncate">
                                    {item.contactName}
                                  </span>
                                </div>
                                <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 shrink-0 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded-full">
                                  {item.ageHours}h ago
                                </span>
                              </div>
                            ))}
                          {(dashboard?.agingConversations?.sample ?? []).length > 3 && (
                            <button
                              onClick={() => setAgingExpanded((p) => !p)}
                              className="text-xs text-primary hover:underline px-2 py-1"
                            >
                              {agingExpanded ? "Show less" : `Show ${(dashboard?.agingConversations?.sample ?? []).length - 3} more`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
