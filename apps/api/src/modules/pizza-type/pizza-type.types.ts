import type { pizzaTypes } from "../../db/schema.js";

export type PizzaType = typeof pizzaTypes.$inferSelect;

export interface PizzaTypeListEntry {
  id: number;
  name: string;
  price: number;
}

export interface PizzaTypeRepository {
  findAll(): Promise<PizzaType[]>;
}
