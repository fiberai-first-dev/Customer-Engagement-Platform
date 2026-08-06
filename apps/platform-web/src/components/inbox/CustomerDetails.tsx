import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Mail,
  MapPin,
  Package,
  RefreshCcw,
  RotateCcw,
  Truck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import type { ChannelType, Contact, Conversation } from "../../api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  buildMockCustomerCommerce,
  formatInr,
  formatOrderDate,
  type OrderStatusKey,
} from "../customer/mockCustomerCommerce";
import {
  CHANNELS,
  channelLabel,
  cn,
  contactDisplayName,
  formatIdentities,
  identitiesFor,
  initials,
} from "./utils";

type Props = {
  contact: Contact | null;
  conversationsByChannel: Partial<Record<ChannelType, Conversation>>;
  onClose: () => void;
};

type TabId = "profile" | "stats" | "orders";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "stats", label: "Order stats" },
  { id: "orders", label: "Recent orders" },
];

function orderStatusClass(key: OrderStatusKey): string {
  if (key === "delivered")
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (key === "in_transit" || key === "placed")
    return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30";
  if (key === "rto")
    return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
  if (key === "cancelled")
    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
  if (key === "exchanged")
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function listValues(primary: string | null | undefined, list?: string[] | null): string[] {
  if (list?.length) return list;
  return primary?.trim() ? [primary.trim()] : [];
}

export function CustomerDetails({ contact, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("profile");

  const commerce = useMemo(
    () =>
      buildMockCustomerCommerce(
        contact?.id || contact?.email || contact?.whatsappId || contact?.phone || "anon",
      ),
    [contact?.id, contact?.email, contact?.whatsappId, contact?.phone],
  );

  if (!contact) {
    return (
      <aside className="flex w-[400px] shrink-0 flex-col border-l border-border bg-card">
        <Header onClose={onClose} />
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No customer selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open a conversation to view profile and order context.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const name = contactDisplayName(contact);
  const emails = listValues(contact.email, contact.emails);
  const whatsappIds = listValues(
    contact.whatsappId ?? contact.identifiers?.whatsapp,
    contact.whatsappIds,
  );

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-border bg-card">
      <Header onClose={onClose} />

      <div className="border-b border-border px-4 pb-4 pt-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
              {initials(name)}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">{name}</h4>
            <p className="truncate text-[11px] text-muted-foreground">
              {emails[0] || whatsappIds[0] || "No contact identifiers"}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              LTV {formatInr(commerce.stats.lifetimeValue)} · {commerce.stats.totalOrders} orders
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-lg px-2 py-2 text-[11px] font-semibold transition-all",
                tab === item.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-background px-4 py-4">
        {tab === "profile" && (
          <ProfileTab contact={contact} emails={emails} whatsappIds={whatsappIds} />
        )}
        {tab === "stats" && <StatsTab stats={commerce.stats} />}
        {tab === "orders" && <OrdersTab orders={commerce.orders} />}
      </div>

      <div className="border-t border-border px-4 py-2.5 bg-card">
        <p className="text-center text-[10px] text-muted-foreground">Order data is demo mock</p>
      </div>
    </aside>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3.5 bg-card">
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Customer context</h3>
        <p className="text-[11px] text-muted-foreground">Profile & order intelligence</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onClose}
        aria-label="Close customer context"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ProfileTab({
  contact,
  emails,
  whatsappIds,
}: {
  contact: Contact;
  emails: string[];
  whatsappIds: string[];
}) {
  const rows = [
    { label: "Name", value: contact.name || "—" },
    { label: "Emails", value: emails.length ? emails.join(", ") : "—" },
    { label: "WhatsApp", value: whatsappIds.length ? whatsappIds.join(", ") : "—" },
    { label: "Customer ID", value: contact.id },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle icon={<UserRound className="h-3.5 w-3.5" />} title="Profile details" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-xs">
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.label} className={cn(idx !== rows.length - 1 && "border-b border-border")}>
                <th className="w-[38%] px-3 py-2.5 font-medium text-muted-foreground">{row.label}</th>
                <td className="px-3 py-2.5 font-medium text-foreground break-all">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle icon={<Mail className="h-3.5 w-3.5" />} title="Connected channels" />
      <div className="space-y-2">
        {CHANNELS.map((channel) => {
          const ids = identitiesFor(contact, channel.id);
          if (!ids.length) return null;
          return (
            <div key={channel.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {channelLabel(channel.id)}
                </span>
              </div>
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {formatIdentities(ids, channel.id)}
              </p>
            </div>
          );
        })}
        {CHANNELS.every((c) => !identitiesFor(contact, c.id).length) && (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No channel identities linked yet.
          </p>
        )}
      </div>
    </div>
  );
}

function StatsTab({
  stats,
}: {
  stats: ReturnType<typeof buildMockCustomerCommerce>["stats"];
}) {
  const metrics = [
    {
      label: "Delivered",
      value: stats.delivered,
      hint: "Successful",
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      label: "RTO",
      value: stats.rto,
      hint: `${stats.rtoRate}% rate`,
      icon: <RotateCcw className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />,
    },
    {
      label: "Cancelled",
      value: stats.cancelled,
      hint: "Buyer / ops",
      icon: <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />,
    },
    {
      label: "In transit",
      value: stats.inTransit,
      hint: "Live Shipments",
      icon: <Truck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />,
    },
    {
      label: "Exchanged",
      value: stats.exchanged,
      hint: "Post-delivery",
      icon: <RefreshCcw className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />,
    },
    {
      label: "Total",
      value: stats.totalOrders,
      hint: "All time",
      icon: <Package className="h-3.5 w-3.5 text-muted-foreground" />,
    },
  ];

  const summaryRows = [
    { label: "Lifetime value", value: formatInr(stats.lifetimeValue) },
    { label: "Avg order value", value: formatInr(stats.avgOrderValue) },
    { label: "RTO rate", value: `${stats.rtoRate}%` },
    { label: "Last order", value: `${stats.lastOrderDaysAgo}d ago` },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle icon={<Package className="h-3.5 w-3.5" />} title="Order performance" />
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {m.label}
              </span>
              {m.icon}
            </div>
            <p className="text-xl font-semibold tracking-tight text-foreground">{m.value}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{m.hint}</p>
          </div>
        ))}
      </div>

      <SectionTitle icon={<MapPin className="h-3.5 w-3.5" />} title="Commerce summary" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="px-3 py-2 font-semibold text-muted-foreground">Metric</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Value</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row, idx) => (
              <tr
                key={row.label}
                className={cn(idx !== summaryRows.length - 1 && "border-b border-border")}
              >
                <td className="px-3 py-2.5 text-muted-foreground">{row.label}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-foreground">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrdersTab({
  orders,
}: {
  orders: ReturnType<typeof buildMockCustomerCommerce>["orders"];
}) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={<Package className="h-3.5 w-3.5" />} title="Recent orders" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[340px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-3 py-2 font-semibold text-muted-foreground">Order</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => (
                <tr
                  key={order.orderId}
                  className={cn(idx !== orders.length - 1 && "border-b border-border")}
                >
                  <td className="px-3 py-2.5 align-top">
                    <p className="font-semibold text-foreground">{order.orderId}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatOrderDate(order.placedOn)} · {order.payment}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                      {order.items}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 rounded-md px-1.5 text-[10px]",
                        orderStatusClass(order.statusKey),
                      )}
                    >
                      {order.status}
                    </Badge>
                    <p className="mt-1 text-[10px] text-muted-foreground">{order.city}</p>
                  </td>
                  <td className="px-3 py-2.5 align-top text-right font-semibold text-foreground">
                    {formatInr(order.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3">
        <p className="text-[11px] font-medium text-foreground">Agent tips</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
          <li>Check RTO rate before approving COD replacements.</li>
          <li>Prefer prepaid discounts for repeat RTO customers.</li>
          <li>Quote last order ID when talking shipping delays.</li>
        </ul>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h5 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h5>
    </div>
  );
}
