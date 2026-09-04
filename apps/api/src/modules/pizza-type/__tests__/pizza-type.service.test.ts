import { describe, it, expect } from "vitest";
import { PizzaTypeService } from "../pizza-type.service.js";
import type { PizzaType, PizzaTypeRepository } from "../pizza-type.types.js";

function makeRepo(rows: PizzaType[]): PizzaTypeRepository {
  return {
    findAll: async () => rows,
  };
}

describe("PizzaTypeService.list", () => {
  it("returns an empty array when the catalog is empty", async () => {
    const service = new PizzaTypeService(makeRepo([]));
    expect(await service.list()).toEqual([]);
  });

  it("converts the stored decimal price string into a numeric price", async () => {
    const service = new PizzaTypeService(
      makeRepo([{ id: 1, name: "Margherita", price: "9.99" }]),
    );
    expect(await service.list()).toEqual([{ id: 1, name: "Margherita", price: 9.99 }]);
  });

  it("sorts results by id ascending regardless of repository order", async () => {
    const service = new PizzaTypeService(
      makeRepo([
        { id: 3, name: "Pepperoni", price: "12.50" },
        { id: 1, name: "Margherita", price: "9.99" },
        { id: 2, name: "Hawaiian", price: "11.00" },
      ]),
    );
    expect((await service.list()).map((p) => p.id)).toEqual([1, 2, 3]);
  });
});
