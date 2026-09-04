import type { InvalidParam } from "../../utils/apiError.js";
import { InvalidPizzaTypeReferenceError, OrderForbiddenError, OrderNotFoundError } from "../../utils/apiError.js";
import type {
  Order,
  OrderDetail,
  OrderItem,
  OrderItemInput,
  OrderListResult,
  OrderRepository,
  PizzaType,
} from "./order.types.js";
import { centsToAmount, toCents } from "../../utils/money.js";

export class OrderService {
  constructor(private readonly repo: OrderRepository) {}

  async list(userId: number, limit: number, offset: number): Promise<OrderListResult> {
    const [ordersWithItems, total] = await Promise.all([
      this.repo.findAll(userId, limit, offset),
      this.repo.count(userId),
    ]);

    const pizzaTypeIds = [...new Set(ordersWithItems.flatMap((order) => order.items.map((item) => item.pizzaTypeId)))];
    const pizzaTypes = await this.repo.findPizzaTypesByIds(pizzaTypeIds);
    const priceById = new Map(pizzaTypes.map((pizzaType) => [pizzaType.id, pizzaType.price]));

    const data = ordersWithItems.map((order) => {
      const totalCents = order.items.reduce((sum, item) => {
        const price = priceById.get(item.pizzaTypeId);
        return sum + (price ? toCents(price) * item.quantity : 0);
      }, 0);
      return {
        id: order.id,
        userId: order.userId,
        createdAt: order.createdAt,
        total: centsToAmount(totalCents),
        itemCount: order.items.length,
      };
    });

    const page = Math.floor(offset / limit) + 1;
    const pages = total === 0 ? 0 : Math.ceil(total / limit);

    return { data, page, pages, total };
  }

  async getById(orderId: number, userId: number): Promise<OrderDetail> {
    const order = await this.findOwnedOrder(orderId, userId);
    const items = await this.repo.findItemsByOrderId(orderId);
    return this.buildDetail(order, items);
  }

  async create(userId: number, items: OrderItemInput[]): Promise<OrderDetail> {
    await this.assertPizzaTypesExist(items);
    const created = await this.repo.create({ userId, items });
    return this.buildDetail(created, created.items);
  }

  async update(orderId: number, userId: number, items: OrderItemInput[]): Promise<OrderDetail> {
    const order = await this.findOwnedOrder(orderId, userId);
    await this.assertPizzaTypesExist(items);

    await this.repo.replaceItems(orderId, items);
    const newItems = await this.repo.findItemsByOrderId(orderId);
    return this.buildDetail(order, newItems);
  }

  async remove(orderId: number, userId: number): Promise<void> {
    const order = await this.findOwnedOrder(orderId, userId);
    await this.repo.deleteById(order.id);
  }

  // Existence-then-ownership (Business rules #10): a nonexistent id is always 404 regardless of
  // caller; an existing id owned by someone else is 403. This DB-dependent authorization decision
  // belongs here, not in zod.
  private async findOwnedOrder(orderId: number, userId: number): Promise<Order> {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw new OrderNotFoundError();
    }
    if (order.userId !== userId) {
      throw new OrderForbiddenError();
    }
    return order;
  }

  // pizzaTypeId existence is cross-entity and requires a DB read, so — unlike its shape check
  // (positive integer, enforced by zod) — it lives here (Business rules #4).
  private async assertPizzaTypesExist(items: OrderItemInput[]): Promise<void> {
    const ids = [...new Set(items.map((item) => item.pizzaTypeId))];
    const found = await this.repo.findPizzaTypesByIds(ids);
    const foundIds = new Set(found.map((pizzaType) => pizzaType.id));

    const invalidParams: InvalidParam[] = [];
    items.forEach((item, index) => {
      if (!foundIds.has(item.pizzaTypeId)) {
        invalidParams.push({ id: `items[${index}].pizzaTypeId`, message: "pizzaTypeId does not exist" });
      }
    });

    if (invalidParams.length > 0) {
      throw new InvalidPizzaTypeReferenceError(invalidParams);
    }
  }

  private async buildDetail(order: Order, items: OrderItem[]): Promise<OrderDetail> {
    const pizzaTypeIds = [...new Set(items.map((item) => item.pizzaTypeId))];
    const pizzaTypes = await this.repo.findPizzaTypesByIds(pizzaTypeIds);
    const byId = new Map<number, PizzaType>(pizzaTypes.map((pizzaType) => [pizzaType.id, pizzaType]));

    let totalCents = 0;
    const detailItems = items.map((item) => {
      const pizzaType = byId.get(item.pizzaTypeId);
      const unitPriceCents = pizzaType ? toCents(pizzaType.price) : 0;
      const lineCents = unitPriceCents * item.quantity;
      totalCents += lineCents;
      return {
        id: item.id,
        pizzaTypeId: item.pizzaTypeId,
        pizzaTypeName: pizzaType?.name ?? "",
        quantity: item.quantity,
        unitPrice: centsToAmount(unitPriceCents),
        lineTotal: centsToAmount(lineCents),
      };
    });

    return {
      id: order.id,
      userId: order.userId,
      createdAt: order.createdAt,
      items: detailItems,
      total: centsToAmount(totalCents),
    };
  }
}
