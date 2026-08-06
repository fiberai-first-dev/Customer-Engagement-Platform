export type OrderStatus =
  | "Placed"
  | "Confirmed"
  | "Shipped"
  | "Out for Delivery"
  | "Delivered"
  | "Cancelled"
  | "Returned";

export interface OrderItem {
  name: string;
  quantity: number;
}

export interface CustomerOrder {
  orderId: string;
  status: OrderStatus | string;
  amount: number;
  currency: string;
  date: string; // ISO date YYYY-MM-DD
  items: OrderItem[];
}

export interface OrdersResponse {
  orders: CustomerOrder[];
}

export interface OrderLookupQuery {
  email?: string | null;
  phone?: string | null;
}

export interface OrderProvider {
  readonly name: string;
  getOrdersForCustomer(query: OrderLookupQuery): Promise<OrdersResponse>;
}
