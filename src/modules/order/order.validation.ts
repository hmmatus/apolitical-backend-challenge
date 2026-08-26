import { z } from "zod";

/**
 * Per "Validation layering" in docs/plans/orders.md, every shape-level check for this module lives
 * here as a zod schema — quantity/pizzaTypeId positivity+integer-ness, non-empty items, limit/
 * offset shape, and the :id path param. Nothing in order.controller.ts/order.service.ts should
 * re-implement any of these as a manual `if`.
 */
const orderItemInputSchema = z.object({
  pizzaTypeId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
});

export const updateOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
});

export const listOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
export type UpdateOrderBody = z.infer<typeof updateOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type OrderIdParam = z.infer<typeof orderIdParamSchema>;
