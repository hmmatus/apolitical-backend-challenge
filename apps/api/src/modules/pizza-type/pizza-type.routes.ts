import { Router } from "express";
import * as pizzaTypeController from "./pizza-type.controller.js";

export const pizzaTypeRouter = Router();

/**
 * @openapi
 * /api/pizza-types:
 *   get:
 *     tags: [PizzaTypes]
 *     summary: List all pizza types
 *     description: >
 *       Returns the full catalog, ordered by id. Public (no auth required) — this is menu data,
 *       not user-specific, and the frontend's pizza picker needs it before login. Unlike
 *       /api/orders this is not paginated: the catalog is small and fixed.
 *     responses:
 *       200:
 *         description: List of pizza types
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PizzaType'
 */
pizzaTypeRouter.get("/", pizzaTypeController.list);
