import type { NextFunction, Request, Response } from "express";
import { pizzaTypeRepository } from "./pizza-type.repository.js";
import { PizzaTypeService } from "./pizza-type.service.js";

const pizzaTypeService = new PizzaTypeService(pizzaTypeRepository);

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await pizzaTypeService.list();
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}
