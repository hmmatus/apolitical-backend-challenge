import { centsToAmount, toCents } from "../../utils/money.js";
import type { PizzaTypeListEntry, PizzaTypeRepository } from "./pizza-type.types.js";

export class PizzaTypeService {
  constructor(private readonly repo: PizzaTypeRepository) {}

  // No pagination: the catalog is small and fixed, unlike /api/orders' per-user, growing
  // collection, so this returns everything in one response rather than a {data, page, pages,
  // total} envelope.
  async list(): Promise<PizzaTypeListEntry[]> {
    const rows = await this.repo.findAll();
    return rows
      .map((pizzaType) => ({
        id: pizzaType.id,
        name: pizzaType.name,
        price: centsToAmount(toCents(pizzaType.price)),
      }))
      .sort((a, b) => a.id - b.id);
  }
}
