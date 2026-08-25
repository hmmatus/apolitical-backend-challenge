import { defineRelations } from "drizzle-orm";
import { decimal, int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const pizzaTypes = mysqlTable("pizza_types", {
  id: int().primaryKey().autoincrement(),
  name: varchar({ length: 256 }).notNull(),
  price: decimal({ precision: 10, scale: 2 }).notNull(),
});

export const users = mysqlTable("users", {
  id: int().primaryKey().autoincrement(),
  email: varchar({ length: 256 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 256 }).notNull(),
  name: varchar({ length: 256 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orders = mysqlTable("orders", {
  id: int().primaryKey().autoincrement(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id),
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

export const hashedRefreshTokens = mysqlTable("hashed_refresh_tokens", {
  id: int().primaryKey().autoincrement(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const dbRelations = defineRelations(
  { users, pizzaTypes, orders, orderItems, hashedRefreshTokens },
  (r) => ({
    users: {
      orders: r.many.orders({
        from: r.users.id,
        to: r.orders.userId,
      }),
      refreshTokens: r.many.hashedRefreshTokens({
        from: r.users.id,
        to: r.hashedRefreshTokens.userId,
      }),
    },
    hashedRefreshTokens: {
      user: r.one.users({
        from: r.hashedRefreshTokens.userId,
        to: r.users.id,
        optional: false,
      }),
    },
    orders: {
      user: r.one.users({
        from: r.orders.userId,
        to: r.users.id,
        optional: false,
      }),
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
