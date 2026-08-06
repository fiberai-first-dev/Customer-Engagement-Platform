import { useAuthStore } from "../store/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface OrderItem {
  name: string;
  quantity: number;
}

export interface CustomerOrder {
  orderId: string;
  status: string;
  amount: number;
  currency?: string;
  date: string;
  items: OrderItem[];
}

export interface OrdersResponse {
  orders: CustomerOrder[];
}

export interface OrderLookupQuery {
  email?: string | null;
  phone?: string | null;
}

async function requestOrders(query: OrderLookupQuery): Promise<OrdersResponse> {
  const token = useAuthStore.getState().token;
  const params = new URLSearchParams();
  if (query.email?.trim()) params.set("email", query.email.trim());
  if (query.phone?.trim()) params.set("phone", query.phone.trim());

  if (![...params.keys()].length) {
    return { orders: [] };
  }

  const res = await fetch(`${API_BASE}/api/v1/orders?${params.toString()}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body) as { error?: string };
      throw new Error(parsed.error || body || "Failed to load orders");
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(body || "Failed to load orders");
      throw err;
    }
  }

  return res.json() as Promise<OrdersResponse>;
}

/**
 * Frontend order service — only talks to the platform orders API.
 * UI components must not embed mock order data.
 */
export const orderService = {
  getOrdersForCustomer(query: OrderLookupQuery): Promise<OrdersResponse> {
    return requestOrders(query);
  },
};
