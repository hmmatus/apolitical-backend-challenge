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
