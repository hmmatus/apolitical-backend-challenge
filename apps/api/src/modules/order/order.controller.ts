import type { NextFunction, Request, Response } from "express";
import { orderRepository } from "./order.repository.js";
import { OrderService } from "./order.service.js";
import type { ListOrdersQuery, OrderIdParam } from "./order.validation.js";

const orderService = new OrderService(orderRepository);

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { limit, offset } = req.query as unknown as ListOrdersQuery;
    const result = await orderService.list(req.user!.id, limit, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as OrderIdParam;
    const order = await orderService.getById(id, req.user!.id);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { items } = req.body as { items: { pizzaTypeId: number; quantity: number }[] };
    const order = await orderService.create(req.user!.id, items);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as OrderIdParam;
    const { items } = req.body as { items: { pizzaTypeId: number; quantity: number }[] };
    const order = await orderService.update(id, req.user!.id, items);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as OrderIdParam;
    await orderService.remove(id, req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
