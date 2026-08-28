import { describe, it, expect } from "vitest";
import { swaggerSpec } from "../swagger.js";

interface OpenApiDocument {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
}

const spec = swaggerSpec as unknown as OpenApiDocument;

describe("swaggerSpec", () => {
  it("documents exactly the four auth endpoints as POST operations", () => {
    const expectedPaths = [
      "/api/auth/signup",
      "/api/auth/login",
      "/api/auth/refresh",
      "/api/auth/logout",
    ];

    for (const path of expectedPaths) {
      expect(spec.paths).toHaveProperty(path);
      expect(spec.paths[path]).toHaveProperty("post");
    }

    expect(Object.keys(spec.paths).sort()).toEqual(expectedPaths.sort());
  });

  it("defines every schema referenced by the auth paths under components.schemas", () => {
    const specText = JSON.stringify(spec.paths);
    const refPattern = /#\/components\/schemas\/([A-Za-z0-9_]+)/g;
    const referencedSchemas = new Set<string>();
    for (const match of specText.matchAll(refPattern)) {
      referencedSchemas.add(match[1]);
    }

    expect(referencedSchemas.size).toBeGreaterThan(0);
    for (const schemaName of referencedSchemas) {
      expect(spec.components.schemas).toHaveProperty(schemaName);
    }
  });

  it("includes the shared ApiError and TokenPairResponse schemas", () => {
    expect(spec.components.schemas).toHaveProperty("ApiError");
    expect(spec.components.schemas).toHaveProperty("TokenPairResponse");
    expect(spec.components.schemas).toHaveProperty("SignupRequest");
    expect(spec.components.schemas).toHaveProperty("LoginRequest");
    expect(spec.components.schemas).toHaveProperty("RefreshRequest");
  });
});
