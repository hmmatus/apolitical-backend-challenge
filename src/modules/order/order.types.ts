import type { orderItems, orders, pizzaTypes } from "../../db/schema.js";

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type PizzaType = typeof pizzaTypes.$inferSelect;

export interface OrderItemInput {
  pizzaTypeId: number;
  quantity: number;
}

export interface CreateOrderInput {
  userId: number;
  items: OrderItemInput[];
}

export type OrderWithItems = Order & { items: OrderItem[] };

export interface OrderListEntry {
  id: number;
  userId: number;
  createdAt: Date;
  total: number;
  itemCount: number;
}

export interface OrderDetailItem {
  id: number;
  pizzaTypeId: number;
  pizzaTypeName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderDetail {
  id: number;
  userId: number;
  createdAt: Date;
  items: OrderDetailItem[];
  total: number;
}

export interface OrderListResult {
  data: OrderListEntry[];
  page: number;
  pages: number;
  total: number;
}

/**
 * `findById` deliberately takes only an id (no `userId`) — the service decides 404 vs. 403 vs.
 * proceed, since that's a business/authorization decision, not a data-access concern. `findAll`/
 * `count` take `userId` directly since list scoping is a plain filter. See docs/plans/orders.md
 * ("Module layout") for the full rationale.
 */
export interface OrderRepository {
  findAll(userId: number, limit: number, offset: number): Promise<OrderWithItems[]>;
  count(userId: number): Promise<number>;
  findById(id: number): Promise<Order | undefined>;
  findItemsByOrderId(orderId: number): Promise<OrderItem[]>;
  findPizzaTypesByIds(ids: number[]): Promise<PizzaType[]>;
  create(input: CreateOrderInput): Promise<OrderWithItems>;
  replaceItems(orderId: number, items: OrderItemInput[]): Promise<void>;
  deleteById(id: number): Promise<void>;
}
