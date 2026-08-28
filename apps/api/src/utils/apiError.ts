export interface InvalidParam {
  id: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly description: string,
    public readonly invalidParams?: InvalidParam[],
  ) {
    super(description);
    this.name = "ApiError";
  }
}

export class EmailTakenError extends ApiError {
  constructor() {
    super(409, "Email already in use");
    this.name = "EmailTakenError";
  }
}

export class InvalidCredentialsError extends ApiError {
  constructor() {
    super(401, "Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class InvalidRefreshTokenError extends ApiError {
  constructor() {
    super(401, "Invalid or expired refresh token");
    this.name = "InvalidRefreshTokenError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(401, message);
    this.name = "UnauthorizedError";
  }
}

export class OrderNotFoundError extends ApiError {
  constructor() {
    super(404, "Order not found");
    this.name = "OrderNotFoundError";
  }
}

export class OrderForbiddenError extends ApiError {
  constructor() {
    super(403, "You do not have access to this order");
    this.name = "OrderForbiddenError";
  }
}

export class EmptyOrderItemsError extends ApiError {
  constructor() {
    super(400, "Order must have at least one item");
    this.name = "EmptyOrderItemsError";
  }
}

export class InvalidPizzaTypeReferenceError extends ApiError {
  constructor(invalidParams: InvalidParam[]) {
    super(400, "One or more pizzaTypeId values do not exist", invalidParams);
    this.name = "InvalidPizzaTypeReferenceError";
  }
}
