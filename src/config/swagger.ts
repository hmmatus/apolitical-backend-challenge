import swaggerJsdoc from "swagger-jsdoc";

// Hand-written to mirror src/modules/auth/auth.dto.ts's Zod schemas — nothing enforces these
// stay in sync automatically, so update both together when a request/response shape changes.
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Pizza Ordering API",
      version: "1.0.0",
      description: "JSON API for the pizza-ordering backend challenge.",
    },
    servers: [{ url: "/" }],
    tags: [{ name: "Auth", description: "Signup, login, and token lifecycle" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ApiError: {
          type: "object",
          required: ["status", "description"],
          properties: {
            status: { type: "integer", example: 400 },
            description: { type: "string", example: "Validation failed" },
            invalid_params: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "message"],
                properties: {
                  id: { type: "string", example: "email" },
                  message: { type: "string", example: "Invalid email address" },
                },
              },
            },
          },
        },
        SignupRequest: {
          type: "object",
          required: ["email", "password", "name"],
          properties: {
            email: { type: "string", format: "email", example: "alice@example.com" },
            password: { type: "string", format: "password", minLength: 8, example: "correcthorsebatterystaple" },
            name: { type: "string", minLength: 1, example: "Alice" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email", example: "alice@example.com" },
            password: { type: "string", format: "password", minLength: 1 },
          },
        },
        RefreshRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string", minLength: 1 },
          },
        },
        TokenPairResponse: {
          type: "object",
          required: ["accessToken", "refreshToken"],
          properties: {
            accessToken: { type: "string", description: "Short-lived JWT for the Authorization header" },
            refreshToken: { type: "string", description: "Opaque token used to obtain a new access token" },
          },
        },
      },
    },
  },
  apis: ["./src/modules/**/*.routes.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
