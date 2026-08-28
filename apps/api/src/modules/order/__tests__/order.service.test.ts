import { describe, it, expect } from "vitest";
import type { OrderRepository, Order, OrderItem, PizzaType, OrderItemInput } from "../order.types.js";
import * as orderServiceModule from "../order.service.js";
import {
  OrderNotFoundError,
  OrderForbiddenError,
  InvalidPizzaTypeReferenceError,
} from "../../../utils/apiError.js";

/**
 * The plan (docs/plans/orders.md) doesn't pin down whether `order.service.ts` exports a class
 * `OrderService` or a factory `createOrderService` — same ambiguity `auth.service.test.ts` hit for
 * `AuthService`. This helper accepts either shape so the test isn't coupled to a guess.
 *
 * Method names/signatures below are this test's concrete proposal for the service contract
 * described narratively in the plan's "Module layout" section:
 *   - list(userId, limit, offset) -> { data, page, pages, total }
 *   - getById(orderId, userId) -> order detail (throws OrderNotFoundError / OrderForbiddenError)
 *   - create(userId, items) -> order detail
 *   - update(orderId, userId, items) -> order detail (throws OrderNotFoundError / OrderForbiddenError /
 *     InvalidPizzaTypeReferenceError)
 *   - remove(orderId, userId) -> void (throws OrderNotFoundError / OrderForbiddenError)
 * `limit`/`offset`/`:id` are assumed already shape-validated (zod) by the time they reach the
 * service, per "Validation layering" in the plan — this file never exercises malformed values for
 * those, see order.validation.test.ts for that coverage.
 */
interface OrderListEntry {
  id: number;
  userId: number;
  createdAt: Date;
  total: number;
  itemCount: number;
}

interface OrderDetailItem {
  id: number;
  pizzaTypeId: number;
  pizzaTypeName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface OrderDetail {
  id: number;
  userId: number;
  createdAt: Date;
  items: OrderDetailItem[];
  total: number;
}

interface OrderServiceLike {
  list(
    userId: number,
    limit: number,
    offset: number,
  ): Promise<{ data: OrderListEntry[]; page: number; pages: number; total: number }>;
  getById(orderId: number, userId: number): Promise<OrderDetail>;
  create(userId: number, items: OrderItemInput[]): Promise<OrderDetail>;
  update(orderId: number, userId: number, items: OrderItemInput[]): Promise<OrderDetail>;
  remove(orderId: number, userId: number): Promise<void>;
}

function buildOrderService(repo: OrderRepository): OrderServiceLike {
  const mod = orderServiceModule as unknown as {
    OrderService?: new (repo: OrderRepository) => OrderServiceLike;
    createOrderService?: (repo: OrderRepository) => OrderServiceLike;
  };
  if (typeof mod.createOrderService === "function") {
    return mod.createOrderService(repo);
  }
  if (typeof mod.OrderService === "function") {
    return new mod.OrderService(repo);
  }
  throw new Error(
    "src/modules/order/order.service.ts must export either a class `OrderService` or a factory `createOrderService`",
  );
}

const defaultPizzaTypes: PizzaType[] = [
  { id: 1, name: "Margherita", price: "9.50" },
  { id: 2, name: "Pepperoni", price: "12.00" },
  { id: 3, name: "Veggie", price: "9.99" },
  // Chosen specifically because naive float multiply-then-sum of (1.00 * 5) + (1.01 * 3) drifts to
  // 8.030000000000001 in JS, while cents-safe integer arithmetic yields exactly 8.03 — see the
  // "cents-based rounding" test below.
  { id: 4, name: "PlainCheese", price: "1.00" },
  { id: 5, name: "ExtraSauce", price: "1.01" },
];

function createFakeRepo(pizzaTypes: PizzaType[] = defaultPizzaTypes) {
  const orders: Order[] = [];
  const items: OrderItem[] = [];
  let nextOrderId = 1;
  let nextItemId = 1;

  function seedOrder(input: { userId: number; createdAt: Date; items: OrderItemInput[] }): Order {
    const order: Order = { id: nextOrderId++, userId: input.userId, createdAt: input.createdAt };
    orders.push(order);
    for (const item of input.items) {
      items.push({ id: nextItemId++, orderId: order.id, pizzaTypeId: item.pizzaTypeId, quantity: item.quantity });
    }
    return order;
  }

  const repo: OrderRepository = {
    async findAll(userId, limit, offset) {
      const userOrders = orders
        .filter((o) => o.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const page = userOrders.slice(offset, offset + limit);
      return page.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
    },
    async count(userId) {
      return orders.filter((o) => o.userId === userId).length;
    },
    async findById(id) {
      return orders.find((o) => o.id === id);
    },
    async findItemsByOrderId(orderId) {
      return items.filter((i) => i.orderId === orderId);
    },
    async findPizzaTypesByIds(ids) {
      return pizzaTypes.filter((p) => ids.includes(p.id));
    },
    async create(input) {
      const order: Order = { id: nextOrderId++, userId: input.userId, createdAt: new Date() };
      orders.push(order);
      const createdItems = input.items.map((it) => {
        const item: OrderItem = {
          id: nextItemId++,
          orderId: order.id,
          pizzaTypeId: it.pizzaTypeId,
          quantity: it.quantity,
        };
        items.push(item);
        return item;
      });
      return { ...order, items: createdItems };
    },
    async replaceItems(orderId, newItems) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].orderId === orderId) items.splice(i, 1);
      }
      for (const it of newItems) {
        items.push({ id: nextItemId++, orderId, pizzaTypeId: it.pizzaTypeId, quantity: it.quantity });
      }
    },
    async deleteById(id) {
      const idx = orders.findIndex((o) => o.id === id);
      if (idx !== -1) orders.splice(idx, 1);
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].orderId === id) items.splice(i, 1);
      }
    },
  };

  return { repo, orders, items, seedOrder };
}

describe("OrderService", () => {
  describe("list", () => {
    it("returns the caller's orders, page 1, matching fixture data with defaults limit=20 offset=0", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      seedOrder({ userId: 1, createdAt: new Date("2026-01-01"), items: [{ pizzaTypeId: 1, quantity: 2 }] });
      seedOrder({ userId: 1, createdAt: new Date("2026-01-02"), items: [{ pizzaTypeId: 2, quantity: 1 }] });
      seedOrder({ userId: 1, createdAt: new Date("2026-01-03"), items: [{ pizzaTypeId: 1, quantity: 1 }] });

      const result = await service.list(1, 20, 0);

      expect(result.data).toHaveLength(3);
      expect(result.page).toBe(1);
      expect(result.pages).toBe(1);
      expect(result.total).toBe(3);
    });

    it("paginates: limit=2 offset=2 on 5 fixture orders returns orders 3-4 (0-indexed), page 2, pages 3", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      const seeded = [1, 2, 3, 4, 5].map((n) =>
        seedOrder({ userId: 1, createdAt: new Date(`2026-01-0${n}`), items: [{ pizzaTypeId: 1, quantity: 1 }] }),
      );
      // Newest-first order: seeded[4], seeded[3], seeded[2], seeded[1], seeded[0]
      // limit=2 offset=2 -> indices 2,3 -> seeded[2], seeded[1]

      const result = await service.list(1, 2, 2);

      expect(result.data.map((o) => o.id)).toEqual([seeded[2].id, seeded[1].id]);
      expect(result.page).toBe(2);
      expect(result.pages).toBe(3);
      expect(result.total).toBe(5);
    });

    it("computes each list entry's total as the sum of quantity * pizzaType.price, verified against fixtures", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      seedOrder({
        userId: 1,
        createdAt: new Date("2026-01-01"),
        items: [
          { pizzaTypeId: 1, quantity: 2 }, // 9.50 * 2 = 19.00
          { pizzaTypeId: 2, quantity: 1 }, // 12.00 * 1 = 12.00
        ],
      });

      const result = await service.list(1, 20, 0);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].total).toBe(31.0);
    });

    it("itemCount is the number of orderItems rows, not the sum of quantities", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      seedOrder({
        userId: 1,
        createdAt: new Date("2026-01-01"),
        items: [
          { pizzaTypeId: 1, quantity: 3 },
          { pizzaTypeId: 2, quantity: 5 },
        ],
      });

      const result = await service.list(1, 20, 0);

      expect(result.data[0].itemCount).toBe(2);
    });

    it("returns an empty page for a caller with zero orders", async () => {
      const { repo } = createFakeRepo();
      const service = buildOrderService(repo);

      const result = await service.list(1, 20, 0);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.pages).toBe(0);
      expect(result.page).toBe(1);
    });

    it("orders results newest-first by createdAt", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      const older = seedOrder({ userId: 1, createdAt: new Date("2026-01-01"), items: [{ pizzaTypeId: 1, quantity: 1 }] });
      const newer = seedOrder({ userId: 1, createdAt: new Date("2026-02-01"), items: [{ pizzaTypeId: 1, quantity: 1 }] });

      const result = await service.list(1, 20, 0);

      expect(result.data.map((o) => o.id)).toEqual([newer.id, older.id]);
    });

    it("ownership scoping: only returns the authenticated user's own orders, total/pages exclude other users", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      seedOrder({ userId: 1, createdAt: new Date("2026-01-01"), items: [{ pizzaTypeId: 1, quantity: 1 }] });
      seedOrder({ userId: 1, createdAt: new Date("2026-01-02"), items: [{ pizzaTypeId: 1, quantity: 1 }] });
      seedOrder({ userId: 1, createdAt: new Date("2026-01-03"), items: [{ pizzaTypeId: 1, quantity: 1 }] });
      seedOrder({ userId: 2, createdAt: new Date("2026-01-04"), items: [{ pizzaTypeId: 1, quantity: 1 }] });
      seedOrder({ userId: 2, createdAt: new Date("2026-01-05"), items: [{ pizzaTypeId: 1, quantity: 1 }] });

      const result = await service.list(1, 20, 0);

      expect(result.data).toHaveLength(3);
      expect(result.data.every((o) => o.userId === 1)).toBe(true);
      expect(result.total).toBe(3);
      expect(result.pages).toBe(1);
    });

    it("offset beyond the caller's own row count returns an empty page, not an error", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      for (let n = 1; n <= 5; n++) {
        seedOrder({ userId: 1, createdAt: new Date(`2026-01-0${n}`), items: [{ pizzaTypeId: 1, quantity: 1 }] });
      }
      // Another user has more rows than the offset, but that must not affect this caller's page.
      for (let n = 1; n <= 20; n++) {
        seedOrder({ userId: 2, createdAt: new Date(`2026-02-${String(n).padStart(2, "0")}`), items: [{ pizzaTypeId: 1, quantity: 1 }] });
      }

      const result = await service.list(1, 20, 1000);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(5);
      expect(result.pages).toBe(1);
    });
  });

  describe("getById", () => {
    it("returns items with resolved pizzaTypeName/unitPrice and a total equal to the sum of line totals", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      const order = seedOrder({
        userId: 1,
        createdAt: new Date("2026-01-01"),
        items: [
          { pizzaTypeId: 1, quantity: 3 }, // 9.50 * 3 = 28.50
          { pizzaTypeId: 2, quantity: 2 }, // 12.00 * 2 = 24.00
        ],
      });

      const detail = await service.getById(order.id, 1);

      expect(detail.items).toHaveLength(2);
      const margherita = detail.items.find((i) => i.pizzaTypeId === 1)!;
      expect(margherita.pizzaTypeName).toBe("Margherita");
      expect(margherita.unitPrice).toBe(9.5);
      expect(margherita.lineTotal).toBe(28.5);
      const pepperoni = detail.items.find((i) => i.pizzaTypeId === 2)!;
      expect(pepperoni.pizzaTypeName).toBe("Pepperoni");
      expect(pepperoni.unitPrice).toBe(12.0);
      expect(pepperoni.lineTotal).toBe(24.0);
      expect(detail.total).toBe(52.5);
    });

    it("total equals the single line total for a one-item order", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      const order = seedOrder({ userId: 1, createdAt: new Date("2026-01-01"), items: [{ pizzaTypeId: 2, quantity: 4 }] });

      const detail = await service.getById(order.id, 1);

      expect(detail.total).toBe(48.0);
    });

    it("throws OrderNotFoundError for a nonexistent order id, regardless of caller", async () => {
      const { repo } = createFakeRepo();
      const service = buildOrderService(repo);

      await expect(service.getById(999999, 1)).rejects.toBeInstanceOf(OrderNotFoundError);
    });

    it("throws OrderForbiddenError (not OrderNotFoundError) when the order exists but belongs to another user", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      const order = seedOrder({ userId: 2, createdAt: new Date("2026-01-01"), items: [{ pizzaTypeId: 1, quantity: 1 }] });

      let error: unknown;
      try {
        await service.getById(order.id, 1);
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(OrderForbiddenError);
      expect((error as OrderForbiddenError).status).toBe(403);
      // The forbidden error must not leak the order's contents.
      expect(error).not.toHaveProperty("items");
      expect(error).not.toHaveProperty("total");
    });

    it("existence is checked before ownership: a nonexistent id is 404 even when 'belongs to another user' would also apply", async () => {
      const { repo } = createFakeRepo();
      const service = buildOrderService(repo);

      const error = await service.getById(424242, 1).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(OrderNotFoundError);
      expect(error).not.toBeInstanceOf(OrderForbiddenError);
    });

    it("computes totals with cents-safe rounding, avoiding naive float drift", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      // 1.00 * 5 + 1.01 * 3 drifts to 8.030000000000001 under naive float multiply-then-sum.
      const order = seedOrder({
        userId: 1,
        createdAt: new Date("2026-01-01"),
        items: [
          { pizzaTypeId: 4, quantity: 5 },
          { pizzaTypeId: 5, quantity: 3 },
        ],
      });

      const detail = await service.getById(order.id, 1);

      expect(detail.total).toBe(8.03);
      expect(detail.total).not.toBe(8.030000000000001);
    });
  });

  describe("create", () => {
    it("creates an order for a single item and returns the detail shape with userId from the caller", async () => {
      const { repo } = createFakeRepo();
      const service = buildOrderService(repo);

      const detail = await service.create(1, [{ pizzaTypeId: 1, quantity: 2 }]);

      expect(detail.userId).toBe(1);
      expect(detail.items).toHaveLength(1);
      expect(detail.items[0].pizzaTypeId).toBe(1);
      expect(detail.items[0].quantity).toBe(2);
      expect(detail.total).toBe(19.0);
    });

    it("persists two items referencing the same pizzaTypeId with different quantities as separate rows", async () => {
      const { repo, items } = createFakeRepo();
      const service = buildOrderService(repo);

      const detail = await service.create(1, [
        { pizzaTypeId: 1, quantity: 2 },
        { pizzaTypeId: 1, quantity: 5 },
      ]);

      expect(detail.items).toHaveLength(2);
      const persisted = items.filter((i) => i.orderId === detail.id);
      expect(persisted).toHaveLength(2);
      expect(persisted.map((i) => i.quantity).sort()).toEqual([2, 5]);
    });

    it("always uses the caller's id for userId, independent of any other argument", async () => {
      const { repo } = createFakeRepo();
      const service = buildOrderService(repo);

      const detailA = await service.create(1, [{ pizzaTypeId: 1, quantity: 1 }]);
      const detailB = await service.create(2, [{ pizzaTypeId: 1, quantity: 1 }]);

      expect(detailA.userId).toBe(1);
      expect(detailB.userId).toBe(2);
    });

    it("throws InvalidPizzaTypeReferenceError for an unknown pizzaTypeId and creates no order/item rows", async () => {
      const { repo, orders, items } = createFakeRepo();
      const service = buildOrderService(repo);

      await expect(service.create(1, [{ pizzaTypeId: 9999, quantity: 1 }])).rejects.toBeInstanceOf(
        InvalidPizzaTypeReferenceError,
      );
      expect(orders).toHaveLength(0);
      expect(items).toHaveLength(0);
    });

    it("rejects the whole request (all-or-nothing) when a valid item is mixed with an invalid pizzaTypeId", async () => {
      const { repo, orders, items } = createFakeRepo();
      const service = buildOrderService(repo);

      await expect(
        service.create(1, [
          { pizzaTypeId: 1, quantity: 1 },
          { pizzaTypeId: 9999, quantity: 1 },
        ]),
      ).rejects.toBeInstanceOf(InvalidPizzaTypeReferenceError);
      expect(orders).toHaveLength(0);
      expect(items).toHaveLength(0);
    });

    it("lists every unknown pizzaTypeId in invalidParams, not just the first", async () => {
      const { repo } = createFakeRepo();
      const service = buildOrderService(repo);

      const error = (await service
        .create(1, [
          { pizzaTypeId: 8888, quantity: 1 },
          { pizzaTypeId: 9999, quantity: 1 },
        ])
        .catch((err: unknown) => err)) as InvalidPizzaTypeReferenceError;

      expect(error).toBeInstanceOf(InvalidPizzaTypeReferenceError);
      expect(error.invalidParams).toBeDefined();
      expect(error.invalidParams).toHaveLength(2);
      expect(error.invalidParams?.[0].id).toBe("items[0].pizzaTypeId");
      expect(error.invalidParams?.[1].id).toBe("items[1].pizzaTypeId");
    });
  });

  describe("update", () => {
    it("replaces the item list: response reflects only the new items, total recomputed", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      const order = seedOrder({ userId: 1, createdAt: new Date("2026-01-01"), items: [{ pizzaTypeId: 1, quantity: 1 }] });

      const detail = await service.update(order.id, 1, [{ pizzaTypeId: 2, quantity: 3 }]);

      expect(detail.items).toHaveLength(1);
      expect(detail.items[0].pizzaTypeId).toBe(2);
      expect(detail.items[0].quantity).toBe(3);
      expect(detail.items.some((i) => i.pizzaTypeId === 1)).toBe(false);
      expect(detail.total).toBe(36.0);
    });

    it("is idempotent when updating with the exact same items as before", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      const order = seedOrder({
        userId: 1,
        createdAt: new Date("2026-01-01"),
        items: [{ pizzaTypeId: 1, quantity: 2 }],
      });

      const first = await service.update(order.id, 1, [{ pizzaTypeId: 1, quantity: 2 }]);
      const second = await service.update(order.id, 1, [{ pizzaTypeId: 1, quantity: 2 }]);

      expect(first.items).toHaveLength(1);
      expect(second.items).toHaveLength(1);
      expect(second.total).toBe(first.total);
    });

    it("leaves createdAt and userId unchanged after an update", async () => {
      const { repo, seedOrder } = createFakeRepo();
      const service = buildOrderService(repo);
      const createdAt = new Date("2026-01-01");
      const order = seedOrder({ userId: 1, createdAt, items: [{ pizzaTypeId: 1, quantity: 1 }] });

      const detail = await service.update(order.id, 1, [{ pizzaTypeId: 2, quantity: 1 }]);

      expect(detail.userId).toBe(1);
      expect(detail.createdAt.getTime()).toBe(createdAt.getTime());
    });

    it("throws OrderNotFoundError for a nonexistent order id and mutates no rows", async () => {
      const { repo, items } = createFakeRepo();
      const service = buildOrderService(repo);

      await expect(service.update(999999, 1, [{ pizzaTypeId: 1, quantity: 1 }])).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
      expect(items).toHaveLength(0);
    });

    it("throws OrderForbiddenError when the order belongs to another user, and leaves its items unchanged", async () => {
      const { repo, seedOrder, items } = createFakeRepo();
      const service = buildOrderService(repo);
      const order = seedOrder({ userId: 2, createdAt: new Date("2026-01-01"), items: [{ pizzaTypeId: 1, quantity: 1 }] });
      const itemsBefore = items.filter((i) => i.orderId === order.id).map((i) => ({ ...i }));

      await expect(service.update(order.id, 1, [{ pizzaTypeId: 2, quantity: 9 }])).rejects.toBeInstanceOf(
        OrderForbiddenError,
      );

      const itemsAfter = items.filter((i) => i.orderId === order.id);
      expect(itemsAfter).toEqual(itemsBefore);
    });

    it("existence is checked before ownership on update: nonexistent id never returns 403", async () => {
      const { repo } = createFakeRepo();
      const service = buildOrderService(repo);

      const error = await service.update(555555, 1, [{ pizzaTypeId: 1, quantity: 1 }]).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(OrderNotFoundError);
      expect(error).not.toBeInstanceOf(OrderForbiddenError);
    });

    it("throws InvalidPizzaTypeReferenceError for a shape-valid but nonexistent pizzaTypeId, leaving existing items unchanged", async () => {
      const { repo, seedOrder, items } = createFakeRepo();
      const service = buildOrderService(repo);
      const order = seedOrder({ userId: 1, createdAt: new Date("2026-01-01"), items: [{ pizzaTypeId: 1, quantity: 1 }] });
      const itemsBefore = items.filter((i) => i.orderId === order.id).map((i) => ({ ...i }));

      await expect(service.update(order.id, 1, [{ pizzaTypeId: 9999, quantity: 1 }])).rejects.toBeInstanceOf(
        InvalidPizzaTypeReferenceError,
      );

      const itemsAfter = items.filter((i) => i.orderId === order.id);
      expect(itemsAfter).toEqual(itemsBefore);
    });
  });

  describe("remove", () => {
    it("deletes the order and all its items", async () => {
      const { repo, seedOrder, orders, items } = createFakeRepo();
      const service = buildOrderService(repo);
      const order = seedOrder({
        userId: 1,
        createdAt: new Date("2026-01-01"),
        items: [
          { pizzaTypeId: 1, quantity: 1 },
          { pizzaTypeId: 2, quantity: 1 },
        ],
      });

      await service.remove(order.id, 1);

      expect(orders.find((o) => o.id === order.id)).toBeUndefined();
      expect(items.filter((i) => i.orderId === order.id)).toHaveLength(0);
    });

    it("throws OrderNotFoundError for a nonexistent order id (not idempotent 204)", async () => {
      const { repo } = createFakeRepo();
      const service = buildOrderService(repo);

      await expect(service.remove(999999, 1)).rejects.toBeInstanceOf(OrderNotFoundError);
    });

    it("throws OrderForbiddenError for another user's order and leaves it (and its items) intact", async () => {
      const { repo, seedOrder, orders, items } = createFakeRepo();
      const service = buildOrderService(repo);
      const order = seedOrder({ userId: 2, createdAt: new Date("2026-01-01"), items: [{ pizzaTypeId: 1, quantity: 1 }] });

      await expect(service.remove(order.id, 1)).rejects.toBeInstanceOf(OrderForbiddenError);

      expect(orders.find((o) => o.id === order.id)).toBeDefined();
      expect(items.filter((i) => i.orderId === order.id)).toHaveLength(1);
    });

    it("existence is checked before ownership on delete: nonexistent id never returns 403", async () => {
      const { repo } = createFakeRepo();
      const service = buildOrderService(repo);

      const error = await service.remove(777777, 1).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(OrderNotFoundError);
      expect(error).not.toBeInstanceOf(OrderForbiddenError);
    });
  });
});
