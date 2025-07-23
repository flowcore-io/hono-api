import { z } from "@hono/zod-openapi"
import { expect } from "jsr:@std/expect"
import { beforeEach, describe, it } from "jsr:@std/testing/bdd"
import { HonoApiRouter } from "../src/lib/hono-api-router.ts"
import { HonoApi } from "../src/lib/hono-api.ts"

describe("HonoApi", () => {
  let api: HonoApi

  beforeEach(() => {
    api = new HonoApi({})
  })

  describe("Constructor", () => {
    it("should initialize with default options", () => {
      const defaultApi = new HonoApi({})
      expect(defaultApi.app).toBeDefined()
    })

    it("should initialize with custom openapi options", () => {
      const customApi = new HonoApi({
        openapi: {
          name: "Test API",
          version: "1.0.0",
          description: "Test API Description",
          docPath: "/docs",
          jsonPath: "/api.json",
        },
      })
      expect(customApi.app).toBeDefined()
    })

    it("should initialize with prometheus enabled", () => {
      const prometheusApi = new HonoApi({
        prometheus: {
          enabled: true,
          path: "/metrics",
          secret: "test-secret",
        },
      })
      expect(prometheusApi.app).toBeDefined()
      expect(prometheusApi.prometheusRegistry).toBeDefined()
    })

    it("should initialize with otel enabled", () => {
      const otelApi = new HonoApi({
        otel: {
          enabled: true,
        },
      })
      expect(otelApi.app).toBeDefined()
    })

    it("should initialize with custom logger", () => {
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }
      const loggerApi = new HonoApi({
        logger: mockLogger,
      })
      expect(loggerApi.app).toBeDefined()
    })
  })

  describe("addRouter", () => {
    it("should add router with routes", () => {
      const router = new HonoApiRouter()
      router.get("/test", {
        auth: { optional: true },
        output: z.object({ message: z.string() }),
        handler: () => ({ message: "test" }),
      })

      api.addRouter("/api/v1", router)

      // Verify the route was added (we'll test the actual request later)
      expect(api.app).toBeDefined()
    })

    it("should handle base path correctly", () => {
      const router = new HonoApiRouter()
      router.get("/health", {
        auth: { optional: true },
        output: z.object({ status: z.string() }),
        handler: () => ({ status: "ok" }),
      })

      // Test different base paths
      api.addRouter("/", router)
      api.addRouter("/api", router)
      api.addRouter("/api/v1", router)

      expect(api.app).toBeDefined()
    })

    it("should handle router with basePath", () => {
      const router = new HonoApiRouter("/nested")
      router.get("/endpoint", {
        auth: { optional: true },
        output: z.object({ data: z.string() }),
        handler: () => ({ data: "nested" }),
      })

      api.addRouter("/api", router)
      expect(api.app).toBeDefined()
    })
  })

  describe("Request Handling", () => {
    beforeEach(() => {
      const router = new HonoApiRouter()

      // Simple GET route
      router.get("/hello", {
        auth: { optional: true },
        output: z.object({ message: z.string() }),
        handler: () => ({ message: "Hello World" }),
      })

      // Route with query parameters
      router.get("/search", {
        auth: { optional: true },
        input: {
          query: z.object({
            q: z.string(),
            limit: z.coerce.number().optional().default(10),
          }),
        },
        output: z.object({
          query: z.string(),
          limit: z.number(),
          results: z.array(z.string()),
        }),
        handler: ({ query }) => ({
          query: query.q,
          limit: query.limit,
          results: [`Result for: ${query.q}`],
        }),
      })

      // Route with path parameters
      router.get("/users/:id", {
        auth: { optional: true },
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({
          id: z.string(),
          name: z.string(),
        }),
        handler: ({ params }) => ({
          id: params.id,
          name: `User ${params.id}`,
        }),
      })

      // POST route with body
      router.post("/users", {
        auth: { optional: true },
        input: {
          body: z.object({
            name: z.string(),
            email: z.string().email(),
          }),
        },
        output: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
        }),
        handler: ({ body }) => ({
          id: crypto.randomUUID(),
          name: body.name,
          email: body.email,
        }),
      })

      // Route that returns null (201 No Content)
      router.post("/actions", {
        auth: { optional: true },
        input: {
          body: z.object({
            action: z.string(),
          }),
        },
        handler: ({ body }) => {
          // Simulate action execution
          console.log(`Executing action: ${body.action}`)
          return null
        },
      })

      api.addRouter("/api/v1", router)
    })

    it("should handle simple GET request", async () => {
      const request = new Request("http://localhost/api/v1/hello")
      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("application/json")

      const data = await response.json()
      expect(data).toEqual({ message: "Hello World" })
    })

    it("should handle query parameters", async () => {
      const request = new Request("http://localhost/api/v1/search?q=test&limit=5")
      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toEqual({
        query: "test",
        limit: 5,
        results: ["Result for: test"],
      })
    })

    it("should handle default query parameters", async () => {
      const request = new Request("http://localhost/api/v1/search?q=test")
      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.limit).toBe(10) // default value
    })

    it("should handle path parameters", async () => {
      const request = new Request("http://localhost/api/v1/users/123")
      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toEqual({
        id: "123",
        name: "User 123",
      })
    })

    it("should handle POST request with JSON body", async () => {
      const request = new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
        }),
      })

      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.name).toBe("John Doe")
      expect(data.email).toBe("john@example.com")
      expect(data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) // UUID format
    })

    it("should handle routes returning null (201 No Content)", async () => {
      const request = new Request("http://localhost/api/v1/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "test-action",
        }),
      })

      const response = await api.app.fetch(request)

      expect(response.status).toBe(201)
      expect(await response.text()).toBe("")
    })

    it("should return 404 for non-existent routes", async () => {
      const request = new Request("http://localhost/api/v1/nonexistent")
      const response = await api.app.fetch(request)

      expect(response.status).toBe(404)
    })
  })

  describe("Input Validation", () => {
    beforeEach(() => {
      const router = new HonoApiRouter()

      router.post("/validate", {
        auth: { optional: true },
        input: {
          headers: z.object({
            "x-custom-header": z.string(),
          }),
          params: z.object({
            id: z.string().uuid(),
          }),
          query: z.object({
            required: z.string(),
            optional: z.string().optional(),
          }),
          body: z.object({
            name: z.string().min(1).max(50),
            age: z.number().min(0).max(150),
            email: z.string().email(),
          }),
        },
        output: z.object({ success: z.boolean() }),
        handler: () => ({ success: true }),
      })

      api.addRouter("/api/v1/test/:id", router)
    })

    it("should validate and accept valid input", async () => {
      const request = new Request(
        "http://localhost/api/v1/test/550e8400-e29b-41d4-a716-446655440000/validate?required=test",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-custom-header": "test-value",
          },
          body: JSON.stringify({
            name: "John",
            age: 30,
            email: "john@example.com",
          }),
        },
      )

      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ success: true })
    })

    it("should return 400 for invalid UUID in path", async () => {
      const request = new Request("http://localhost/api/v1/test/invalid-uuid/validate?required=test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-custom-header": "test-value",
        },
        body: JSON.stringify({
          name: "John",
          age: 30,
          email: "john@example.com",
        }),
      })

      const response = await api.app.fetch(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.code).toBe("BAD_REQUEST")
      expect(data.message).toBe("Request validation failed")
    })

    it("should return 400 for missing required query parameter", async () => {
      const request = new Request("http://localhost/api/v1/test/550e8400-e29b-41d4-a716-446655440000/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-custom-header": "test-value",
        },
        body: JSON.stringify({
          name: "John",
          age: 30,
          email: "john@example.com",
        }),
      })

      const response = await api.app.fetch(request)

      expect(response.status).toBe(400)
    })

    it("should return 400 for invalid email in body", async () => {
      const request = new Request(
        "http://localhost/api/v1/test/550e8400-e29b-41d4-a716-446655440000/validate?required=test",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-custom-header": "test-value",
          },
          body: JSON.stringify({
            name: "John",
            age: 30,
            email: "invalid-email",
          }),
        },
      )

      const response = await api.app.fetch(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.code).toBe("BAD_REQUEST")
    })

    it("should return 400 for missing required header", async () => {
      const request = new Request(
        "http://localhost/api/v1/test/550e8400-e29b-41d4-a716-446655440000/validate?required=test",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Missing x-custom-header
          },
          body: JSON.stringify({
            name: "John",
            age: 30,
            email: "john@example.com",
          }),
        },
      )

      const response = await api.app.fetch(request)

      expect(response.status).toBe(400)
    })

    it("should return 400 for missing Content-Type on routes with body", async () => {
      const request = new Request(
        "http://localhost/api/v1/test/550e8400-e29b-41d4-a716-446655440000/validate?required=test",
        {
          method: "POST",
          headers: {
            "x-custom-header": "test-value",
            // Missing Content-Type
          },
          body: JSON.stringify({
            name: "John",
            age: 30,
            email: "john@example.com",
          }),
        },
      )

      const response = await api.app.fetch(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.message).toBe("Content-Type must be application/json")
    })
  })

  describe("OpenAPI Documentation", () => {
    beforeEach(() => {
      api = new HonoApi({
        openapi: {
          name: "Test API",
          version: "1.0.0",
          description: "Test API for OpenAPI generation",
          docPath: "/docs",
          jsonPath: "/openapi.json",
        },
      })

      const router = new HonoApiRouter()
      router.get("/example", {
        summary: "Example endpoint",
        description: "An example endpoint for testing",
        tags: ["example"],
        auth: { optional: true },
        output: z.object({
          message: z.string().openapi({ example: "Hello, world!" }),
        }),
        handler: () => ({ message: "Hello, world!" }),
      })

      api.addRouter("/api/v1", router)
    })

    it("should serve OpenAPI JSON spec", async () => {
      const request = new Request("http://localhost/openapi.json")
      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("application/json")

      const spec = await response.json()
      expect(spec.openapi).toBe("3.1.0")
      expect(spec.info.title).toBe("Test API")
      expect(spec.info.version).toBe("1.0.0")
      expect(spec.info.description).toBe("Test API for OpenAPI generation")
    })

    it("should serve documentation page", async () => {
      const request = new Request("http://localhost/docs")
      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")
    })

    it("should include route information in OpenAPI spec", async () => {
      const request = new Request("http://localhost/openapi.json")
      const response = await api.app.fetch(request)

      const spec = await response.json()
      expect(spec.paths).toBeDefined()
      expect(spec.paths["/api/v1/example"]).toBeDefined()
      expect(spec.paths["/api/v1/example"].get).toBeDefined()
      expect(spec.paths["/api/v1/example"].get.summary).toBe("Example endpoint")
      expect(spec.paths["/api/v1/example"].get.tags).toContain("example")
    })
  })

  describe("Prometheus Metrics", () => {
    it("should serve metrics when enabled", async () => {
      const prometheusApi = new HonoApi({
        prometheus: {
          enabled: true,
          path: "/metrics",
        },
      })

      const request = new Request("http://localhost/metrics")
      const response = await prometheusApi.app.fetch(request)

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/plain")

      const metrics = await response.text()
      expect(metrics).toContain("# HELP")
    })

    it("should protect metrics endpoint with secret", async () => {
      const prometheusApi = new HonoApi({
        prometheus: {
          enabled: true,
          path: "/metrics",
          secret: "test-secret",
        },
      })

      // Request without secret should fail
      const requestWithoutSecret = new Request("http://localhost/metrics")
      const responseWithoutSecret = await prometheusApi.app.fetch(requestWithoutSecret)

      expect(responseWithoutSecret.status).toBe(401)

      // Request with secret should succeed
      const requestWithSecret = new Request("http://localhost/metrics?secret=test-secret")
      const responseWithSecret = await prometheusApi.app.fetch(requestWithSecret)

      expect(responseWithSecret.status).toBe(200)

      // Request with secret in header should succeed
      const requestWithHeaderSecret = new Request("http://localhost/metrics", {
        headers: {
          "x-secret": "test-secret",
        },
      })
      const responseWithHeaderSecret = await prometheusApi.app.fetch(requestWithHeaderSecret)

      expect(responseWithHeaderSecret.status).toBe(200)
    })
  })

  describe("Error Handling", () => {
    beforeEach(() => {
      const router = new HonoApiRouter()

      router.get("/error", {
        auth: { optional: true },
        handler: () => {
          throw new Error("Test error")
        },
      })

      api.addRouter("/api/v1", router)
    })

    it("should handle internal server errors", async () => {
      const request = new Request("http://localhost/api/v1/error")
      const response = await api.app.fetch(request)

      expect(response.status).toBe(500)

      const data = await response.json()
      expect(data.status).toBe(500)
      expect(data.code).toBe("INTERNAL_SERVER_ERROR")
      expect(data.message).toBe("Internal server error")
    })
  })

  describe("Multiple HTTP Methods", () => {
    beforeEach(() => {
      const router = new HonoApiRouter()

      router.get("/resource/:id", {
        auth: { optional: true },
        input: {
          params: z.object({ id: z.string() }),
        },
        output: z.object({ id: z.string(), method: z.string() }),
        handler: ({ params }) => ({ id: params.id, method: "GET" }),
      })

      router.post("/resource", {
        auth: { optional: true },
        input: {
          body: z.object({ name: z.string() }),
        },
        output: z.object({ id: z.string(), name: z.string(), method: z.string() }),
        handler: ({ body }) => ({
          id: crypto.randomUUID(),
          name: body.name,
          method: "POST",
        }),
      })

      router.put("/resource/:id", {
        auth: { optional: true },
        input: {
          params: z.object({ id: z.string() }),
          body: z.object({ name: z.string() }),
        },
        output: z.object({ id: z.string(), name: z.string(), method: z.string() }),
        handler: ({ params, body }) => ({
          id: params.id,
          name: body.name,
          method: "PUT",
        }),
      })

      router.patch("/resource/:id", {
        auth: { optional: true },
        input: {
          params: z.object({ id: z.string() }),
          body: z.object({ name: z.string().optional() }),
        },
        output: z.object({ id: z.string(), method: z.string() }),
        handler: ({ params }) => ({
          id: params.id,
          method: "PATCH",
        }),
      })

      router.delete("/resource/:id", {
        auth: { optional: true },
        input: {
          params: z.object({ id: z.string() }),
        },
        handler: ({ params }) => {
          // Simulate deletion
          console.log(`Deleted resource ${params.id}`)
          return null
        },
      })

      api.addRouter("/api/v1", router)
    })

    it("should handle GET requests", async () => {
      const request = new Request("http://localhost/api/v1/resource/123")
      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.method).toBe("GET")
      expect(data.id).toBe("123")
    })

    it("should handle POST requests", async () => {
      const request = new Request("http://localhost/api/v1/resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Resource" }),
      })

      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.method).toBe("POST")
      expect(data.name).toBe("Test Resource")
    })

    it("should handle PUT requests", async () => {
      const request = new Request("http://localhost/api/v1/resource/123", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Resource" }),
      })

      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.method).toBe("PUT")
      expect(data.id).toBe("123")
      expect(data.name).toBe("Updated Resource")
    })

    it("should handle PATCH requests", async () => {
      const request = new Request("http://localhost/api/v1/resource/123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Patched Resource" }),
      })

      const response = await api.app.fetch(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.method).toBe("PATCH")
      expect(data.id).toBe("123")
    })

    it("should handle DELETE requests", async () => {
      const request = new Request("http://localhost/api/v1/resource/123", {
        method: "DELETE",
      })

      const response = await api.app.fetch(request)

      expect(response.status).toBe(201)
      expect(await response.text()).toBe("")
    })
  })
})
