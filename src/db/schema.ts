import { defineRelations } from "drizzle-orm";
import { decimal, int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const pizzaTypes = mysqlTable("pizza_types", {
  id: int().primaryKey().autoincrement(),
  name: varchar({ length: 256 }).notNull(),
  price: decimal({ precision: 10, scale: 2 }).notNull(),
});

export const orders = mysqlTable("orders", {
  id: int().primaryKey().autoincrement(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orderItems = mysqlTable("order_items", {
  id: int().primaryKey().autoincrement(),
  orderId: int("order_id")
    .notNull()
    .references(() => orders.id),
  pizzaTypeId: int("pizza_type_id")
    .notNull()
    .references(() => pizzaTypes.id),
  quantity: int().notNull(),
});

export const dbRelations = defineRelations(
  { pizzaTypes, orders, orderItems },
  (r) => ({
    orders: {
      items: r.many.orderItems({
        from: r.orders.id,
        to: r.orderItems.orderId,
      }),
    },
    orderItems: {
      order: r.one.orders({
        from: r.orderItems.orderId,
        to: r.orders.id,
        optional: false,
      }),
      pizzaType: r.one.pizzaTypes({
        from: r.orderItems.pizzaTypeId,
        to: r.pizzaTypes.id,
        optional: false,
      }),
    },
  }),
);
