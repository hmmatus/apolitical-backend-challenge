import { describe, it, expect } from "vitest";
import {
  createOrderSchema,
  updateOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
} from "../order.validation.js";

/**
 * Per "Validation layering" in docs/plans/orders.md, every shape-level check lives here as a zod
 * schema, never as a manual `if` in the controller/service — this file is the single source of
 * truth for that layer. Existence/ownership checks (pizzaTypeId lookups, order ownership) are
 * cross-entity/DB-dependent and belong in order.service.test.ts instead, not here.
 */

describe("createOrderSchema", () => {
  it("accepts a valid payload with one item", () => {
    const result = createOrderSchema.safeParse({ items: [{ pizzaTypeId: 1, quantity: 2 }] });
    expect(result.success).toBe(true);
  });

  it("accepts a valid payload with multiple items, including a duplicate pizzaTypeId", () => {
    const result = createOrderSchema.safeParse({
      items: [
        { pizzaTypeId: 1, quantity: 2 },
        { pizzaTypeId: 1, quantity: 5 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty items array", () => {
    const result = createOrderSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "items")).toBe(true);
    }
  });

  it("rejects a missing items field", () => {
    const result = createOrderSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "items")).toBe(true);
    }
  });

  it("rejects quantity: 0", () => {
    const result = createOrderSchema.safeParse({ items: [{ pizzaTypeId: 1, quantity: 0 }] });
    expect(result.success).toBe(false);
  });

  it("rejects a negative quantity", () => {
    const result = createOrderSchema.safeParse({ items: [{ pizzaTypeId: 1, quantity: -1 }] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer quantity", () => {
    const result = createOrderSchema.safeParse({ items: [{ pizzaTypeId: 1, quantity: 1.5 }] });
    expect(result.success).toBe(false);
  });

  it("rejects pizzaTypeId: 0", () => {
    const result = createOrderSchema.safeParse({ items: [{ pizzaTypeId: 0, quantity: 1 }] });
    expect(result.success).toBe(false);
  });

  it("rejects a negative pizzaTypeId", () => {
    const result = createOrderSchema.safeParse({ items: [{ pizzaTypeId: -1, quantity: 1 }] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer pizzaTypeId", () => {
    const result = createOrderSchema.safeParse({ items: [{ pizzaTypeId: 1.5, quantity: 1 }] });
    expect(result.success).toBe(false);
  });

  it("strips an unknown userId field from the body instead of accepting it (Business rules #6)", () => {
    const result = createOrderSchema.safeParse({
      userId: 999,
      items: [{ pizzaTypeId: 1, quantity: 1 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("userId");
    }
  });
});

describe("updateOrderSchema", () => {
  it("accepts a valid payload", () => {
    const result = updateOrderSchema.safeParse({ items: [{ pizzaTypeId: 1, quantity: 2 }] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty items array", () => {
    const result = updateOrderSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a missing items field", () => {
    const result = updateOrderSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects quantity: 0", () => {
    const result = updateOrderSchema.safeParse({ items: [{ pizzaTypeId: 1, quantity: 0 }] });
    expect(result.success).toBe(false);
  });

  it("rejects a negative quantity", () => {
    const result = updateOrderSchema.safeParse({ items: [{ pizzaTypeId: 1, quantity: -1 }] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer quantity", () => {
    const result = updateOrderSchema.safeParse({ items: [{ pizzaTypeId: 1, quantity: 1.5 }] });
    expect(result.success).toBe(false);
  });

  it("rejects pizzaTypeId: 0", () => {
    const result = updateOrderSchema.safeParse({ items: [{ pizzaTypeId: 0, quantity: 1 }] });
    expect(result.success).toBe(false);
  });

  it("rejects a negative pizzaTypeId", () => {
    const result = updateOrderSchema.safeParse({ items: [{ pizzaTypeId: -1, quantity: 1 }] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer pizzaTypeId", () => {
    const result = updateOrderSchema.safeParse({ items: [{ pizzaTypeId: 1.5, quantity: 1 }] });
    expect(result.success).toBe(false);
  });
});

describe("listOrdersQuerySchema", () => {
  it("applies defaults limit=20 offset=0 when both are omitted", () => {
    const result = listOrdersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it("coerces and accepts valid string query values", () => {
    const result = listOrdersQuerySchema.safeParse({ limit: "5", offset: "10" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
      expect(result.data.offset).toBe(10);
    }
  });

  it("rejects limit=0", () => {
    const result = listOrdersQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative limit", () => {
    const result = listOrdersQuerySchema.safeParse({ limit: "-5" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative offset", () => {
    const result = listOrdersQuerySchema.safeParse({ offset: "-1" });
    expect(result.success).toBe(false);
  });

  it("accepts offset=0 explicitly (non-negative, not required to be > 0)", () => {
    const result = listOrdersQuerySchema.safeParse({ offset: "0" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-numeric limit", () => {
    const result = listOrdersQuerySchema.safeParse({ limit: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric offset", () => {
    const result = listOrdersQuerySchema.safeParse({ offset: "abc" });
    expect(result.success).toBe(false);
  });
});

describe("orderIdParamSchema", () => {
  it("coerces a valid numeric string id to a number", () => {
    const result = orderIdParamSchema.safeParse({ id: "5" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(5);
    }
  });

  it("rejects a non-numeric id", () => {
    const result = orderIdParamSchema.safeParse({ id: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects id=0", () => {
    const result = orderIdParamSchema.safeParse({ id: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative id", () => {
    const result = orderIdParamSchema.safeParse({ id: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer id", () => {
    const result = orderIdParamSchema.safeParse({ id: "1.5" });
    expect(result.success).toBe(false);
  });
});
