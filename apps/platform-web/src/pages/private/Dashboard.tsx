import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { MessageSquare, Users, Loader2, Activity, ArrowUpRight, Inbox } from "lucide-react";
import { useDashboardMetrics } from "../../api";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../../utils/utils";

export function DashboardPage() {
  const { data: dashboard, isLoading } = useDashboardMetrics();

  const metrics = [
    { title: "Total Messages", value: dashboard?.totalMessages.toLocaleString() || "0", icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
    { title: "Active Contacts", value: dashboard?.activeContacts.toLocaleString() || "0", icon: Users, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
    { title: "Connected Channels", value: Object.keys(dashboard?.channelDistribution || {}).length.toString(), icon: Activity, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" },
  ];

  const maxChannelCount = Math.max(...Object.values(dashboard?.channelDistribution || {}), 1);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-zinc-950">
      {/* Premium Gradient Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-background border-b border-border/50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-8 py-12 relative z-10">
          <h1 className="text-4xl font-extrabold tracking-tight mb-3 text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
            Welcome to FiberAI
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Here's what's happening with your customer engagement today. Monitor your inbound traffic, active contacts, and channel performance.
          </p>
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto p-8 -mt-8 relative z-20 space-y-8">
        {isLoading ? (
          <div className="flex justify-center p-12 bg-card rounded-2xl shadow-sm border border-border/50">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {metrics.map((m, i) => (
                <Card key={i} className="shadow-sm border-border/50 hover:shadow-md transition-all duration-300 hover:-translate-y-1 bg-card/80 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-3">
                        <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{m.title}</p>
                        <p className="text-4xl font-bold tracking-tight text-foreground">{m.value}</p>
                      </div>
                      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner", m.bg, m.color)}>
                        <m.icon className="w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Recent Activity */}
              <Card className="lg:col-span-7 shadow-sm border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="border-b border-border/50 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">Recent Activity</CardTitle>
                      <CardDescription className="mt-1">Latest inbound messages across your channels.</CardDescription>
                    </div>
                    <div className="p-2 bg-primary/10 rounded-full text-primary">
                      <Inbox className="w-5 h-5" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    {dashboard?.recentActivity?.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
                        <p className="font-medium">No recent activity</p>
                        <p className="text-sm opacity-70">Messages will appear here once received.</p>
                      </div>
                    )}
                    {dashboard?.recentActivity?.map((activity) => (
                      <div key={activity.id} className="group flex items-center gap-5 p-3 -mx-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center font-bold shadow-sm border border-primary/10 group-hover:scale-105 transition-transform">
                          {activity.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {activity.contactName}
                            </p>
                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap bg-muted px-2 py-0.5 rounded-full">
                              {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate leading-relaxed">
                            {activity.preview}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Channel Distribution */}
              <Card className="lg:col-span-5 shadow-sm border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="border-b border-border/50 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">Channel Traffic</CardTitle>
                      <CardDescription className="mt-1">Message volume by source.</CardDescription>
                    </div>
                    <div className="p-2 bg-primary/10 rounded-full text-primary">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-8">
                  {Object.keys(dashboard?.channelDistribution || {}).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                      <Activity className="w-12 h-12 mb-4 opacity-20" />
                      <p className="font-medium">No Channel Data</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(dashboard?.channelDistribution || {}).map(([channel, count]) => {
                        const percentage = Math.round((Number(count) / maxChannelCount) * 100);
                        return (
                          <div key={channel} className="space-y-2 group">
                            <div className="flex justify-between items-end">
                              <span className="text-sm font-semibold capitalize tracking-wide text-foreground group-hover:text-primary transition-colors">{channel}</span>
                              <span className="text-sm font-bold text-muted-foreground">{count as number} msgs</span>
                            </div>
                            <div className="w-full h-3 bg-muted/70 rounded-full overflow-hidden shadow-inner">
                              <div 
                                className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-1000 ease-out shadow-sm" 
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
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
