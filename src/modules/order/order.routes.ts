import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import * as orderController from "./order.controller.js";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  updateOrderSchema,
} from "./order.validation.js";

export const orderRouter = Router();

// Every route in this module is scoped to the caller's own orders (docs/plans/orders.md,
// Business rules #10), so authMiddleware is mounted for the whole router.
orderRouter.use(authMiddleware);

orderRouter.get("/", validate(listOrdersQuerySchema, "query"), orderController.list);

orderRouter.get("/:id", validate(orderIdParamSchema, "params"), orderController.getById);

orderRouter.post("/", validate(createOrderSchema, "body"), orderController.create);

orderRouter.put(
  "/:id",
  validate(orderIdParamSchema, "params"),
  validate(updateOrderSchema, "body"),
  orderController.update,
);

// PATCH shares the same handler/semantics as PUT — this API doesn't distinguish partial vs. full
// update (Business rules #7).
orderRouter.patch(
  "/:id",
  validate(orderIdParamSchema, "params"),
  validate(updateOrderSchema, "body"),
  orderController.update,
);

orderRouter.delete("/:id", validate(orderIdParamSchema, "params"), orderController.remove);
