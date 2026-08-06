import { MockOrderProvider } from "./mock-order.provider.js";
import type { OrderLookupQuery, OrderProvider, OrdersResponse } from "./types.js";

/**
 * Application-facing order service.
 * Swap the provider (mock → Shopify/WooCommerce/custom) without touching controllers or UI.
 */
export class OrderService {
  constructor(private readonly provider: OrderProvider = new MockOrderProvider()) {}

  async getOrdersForCustomer(query: OrderLookupQuery): Promise<OrdersResponse> {
    return this.provider.getOrdersForCustomer({
      email: query.email ?? undefined,
      phone: query.phone ?? undefined,
    });
  }
}

export const orderService = new OrderService();

export type { OrderLookupQuery, OrdersResponse, CustomerOrder, OrderItem } from "./types.js";
