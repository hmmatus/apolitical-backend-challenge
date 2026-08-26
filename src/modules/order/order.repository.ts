import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { orderItems, orders, pizzaTypes } from "../../db/schema.js";
import type { Order, OrderItem, OrderItemInput, OrderRepository, OrderWithItems, PizzaType } from "./order.types.js";

export const orderRepository: OrderRepository = {
  async findAll(userId, limit, offset) {
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    if (orderRows.length === 0) {
      return [];
    }

    const orderIds = orderRows.map((order) => order.id);
    const itemRows = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds));

    return orderRows.map((order) => ({
      ...order,
      items: itemRows.filter((item) => item.orderId === order.id),
    })) as OrderWithItems[];
  },

  async count(userId) {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.userId, userId));
    return Number(row?.count ?? 0);
  },

  async findById(id) {
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    return row as Order | undefined;
  },

  async findItemsByOrderId(orderId) {
    const rows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    return rows as OrderItem[];
  },

  async findPizzaTypesByIds(ids) {
    if (ids.length === 0) {
      return [];
    }
    const rows = await db.select().from(pizzaTypes).where(inArray(pizzaTypes.id, ids));
    return rows as PizzaType[];
  },

  async create(input) {
    return db.transaction(async (tx) => {
      const [result] = await tx.insert(orders).values({ userId: input.userId });
      const orderId = result.insertId;

      if (input.items.length > 0) {
        await tx.insert(orderItems).values(
          input.items.map((item: OrderItemInput) => ({
            orderId,
            pizzaTypeId: item.pizzaTypeId,
            quantity: item.quantity,
          })),
        );
      }

      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
      const createdItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));

      return { ...(order as Order), items: createdItems as OrderItem[] };
    });
  },

  async replaceItems(orderId, items) {
    await db.transaction(async (tx) => {
      await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
      if (items.length > 0) {
        await tx.insert(orderItems).values(
          items.map((item) => ({ orderId, pizzaTypeId: item.pizzaTypeId, quantity: item.quantity })),
        );
      }
    });
  },

  async deleteById(id) {
    await db.transaction(async (tx) => {
      await tx.delete(orderItems).where(eq(orderItems.orderId, id));
      await tx.delete(orders).where(eq(orders.id, id));
    });
  },
};
