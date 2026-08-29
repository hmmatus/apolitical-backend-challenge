import { db } from "../../db/client.js";
import { pizzaTypes } from "../../db/schema.js";
import type { PizzaType, PizzaTypeRepository } from "./pizza-type.types.js";

export const pizzaTypeRepository: PizzaTypeRepository = {
  async findAll() {
    const rows = await db.select().from(pizzaTypes);
    return rows as PizzaType[];
  },
};
