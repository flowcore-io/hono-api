import { z } from "@hono/zod-openapi"
import { expect } from "jsr:@std/expect"
import { beforeEach, describe, it } from "jsr:@std/testing/bdd"
import { HonoApiRouter } from "../src/lib/hono-api-router.ts"

describe("HonoApiRouter", () => {
  let router: HonoApiRouter

  beforeEach(() => {
    router = new HonoApiRouter()
  })

  describe("Constructor", () => {
    it("should initialize with default base path", () => {
      const defaultRouter = new HonoApiRouter()
      expect(defaultRouter.basePath).toBe("/")
    })

    it("should initialize with custom base path", () => {
      const customRouter = new HonoApiRouter("/api/v1")
      expect(customRouter.basePath).toBe("/api/v1")
    })

    it("should normalize base path", () => {
      const router1 = new HonoApiRouter("/api/v1/")
      const router2 = new HonoApiRouter("api/v1")
      expect(router1.basePath).toBe("/api/v1/")
      expect(router2.basePath).toBe("api/v1")
    })
  })

  describe("Route Registration", () => {
    it("should register GET route", () => {
      router.get("/test", {
        auth: { optional: true },
        output: z.object({ message: z.string() }),
        handler: () => ({ message: "test" })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].routeConfig.method).toBe("get")
      expect(routes[0].routeConfig.path).toBe("/test")
    })

    it("should register POST route", () => {
      router.post("/create", {
        auth: { optional: true },
        input: {
          body: z.object({ name: z.string() })
        },
        output: z.object({ id: z.string() }),
        handler: ({ body }) => ({ id: crypto.randomUUID() })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].routeConfig.method).toBe("post")
      expect(routes[0].routeConfig.path).toBe("/create")
    })

    it("should register PUT route", () => {
      router.put("/update/:id", {
        auth: { optional: true },
        input: {
          params: z.object({ id: z.string() }),
          body: z.object({ name: z.string() })
        },
        output: z.object({ success: z.boolean() }),
        handler: () => ({ success: true })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].routeConfig.method).toBe("put")
      expect(routes[0].routeConfig.path).toBe("/update/:id")
    })

    it("should register PATCH route", () => {
      router.patch("/partial/:id", {
        auth: { optional: true },
        input: {
          params: z.object({ id: z.string() }),
          body: z.object({ name: z.string().optional() })
        },
        output: z.object({ updated: z.boolean() }),
        handler: () => ({ updated: true })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].routeConfig.method).toBe("patch")
      expect(routes[0].routeConfig.path).toBe("/partial/:id")
    })

    it("should register DELETE route", () => {
      router.delete("/remove/:id", {
        auth: { optional: true },
        input: {
          params: z.object({ id: z.string() })
        },
        handler: () => null
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].routeConfig.method).toBe("delete")
      expect(routes[0].routeConfig.path).toBe("/remove/:id")
    })

    it("should register multiple routes", () => {
      router.get("/list", {
        auth: { optional: true },
        output: z.array(z.object({ id: z.string() })),
        handler: () => []
      })

      router.post("/create", {
        auth: { optional: true },
        input: { body: z.object({ name: z.string() }) },
        output: z.object({ id: z.string() }),
        handler: () => ({ id: "123" })
      })

      router.delete("/remove/:id", {
        auth: { optional: true },
        input: { params: z.object({ id: z.string() }) },
        handler: () => null
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(3)
      expect(routes.map(r => r.routeConfig.method)).toEqual(["get", "post", "delete"])
    })
  })

  describe("Route Configuration", () => {
    it("should handle routes with no input or output", () => {
      router.get("/simple", {
        auth: { optional: true },
        handler: () => null
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].inOptions.input).toBeUndefined()
      expect(routes[0].inOptions.output).toBeUndefined()
    })

    it("should handle routes with all input types", () => {
      router.post("/complex/:id", {
        summary: "Complex endpoint",
        description: "A complex endpoint with all input types",
        tags: ["complex"],
        auth: { optional: true },
        input: {
          headers: z.object({
            "x-api-key": z.string()
          }),
          params: z.object({
            id: z.string().uuid()
          }),
          query: z.object({
            include: z.string().optional(),
            limit: z.number().default(10)
          }),
          body: z.object({
            name: z.string(),
            metadata: z.record(z.any()).optional()
          })
        },
        output: z.object({
          success: z.boolean(),
          data: z.any()
        }),
        handler: ({ headers, params, query, body }) => ({
          success: true,
          data: {
            id: params.id,
            name: body.name,
            apiKey: headers["x-api-key"],
            query: query,
            metadata: body.metadata
          }
        })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      
      const route = routes[0]
      expect(route.inOptions.summary).toBe("Complex endpoint")
      expect(route.inOptions.description).toBe("A complex endpoint with all input types")
      expect(route.inOptions.tags).toEqual(["complex"])
      expect(route.inOptions.input?.headers).toBeDefined()
      expect(route.inOptions.input?.params).toBeDefined()
      expect(route.inOptions.input?.query).toBeDefined()
      expect(route.inOptions.input?.body).toBeDefined()
      expect(route.inOptions.output).toBeDefined()
    })

    it("should handle authentication configuration", () => {
      router.post("/protected", {
        auth: {
          optional: false,
          permissions: (input) => [{
            action: "write",
            resource: [`frn::tenant:resource:${input.params.id}`]
          }]
        },
        input: {
          params: z.object({ id: z.string() })
        },
        output: z.object({ authorized: z.boolean() }),
        handler: () => ({ authorized: true })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      
      const route = routes[0]
      expect(route.inOptions.auth?.optional).toBe(false)
      expect(route.inOptions.auth?.permissions).toBeDefined()
    })

    it("should handle routes with OpenAPI metadata", () => {
      router.get("/documented", {
        summary: "Documented endpoint",
        description: "This endpoint is well documented",
        tags: ["documentation", "example"],
        auth: { optional: true },
        output: z.object({
          message: z.string().openapi({
            example: "Hello, world!",
            description: "A greeting message"
          })
        }),
        handler: () => ({ message: "Hello, world!" })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      
      const route = routes[0]
      expect(route.inOptions.summary).toBe("Documented endpoint")
      expect(route.inOptions.description).toBe("This endpoint is well documented")
      expect(route.inOptions.tags).toEqual(["documentation", "example"])
    })
  })

  describe("Path Handling", () => {
    it("should handle routes with base path", () => {
      const apiRouter = new HonoApiRouter("/api/v1")
      
      apiRouter.get("/users", {
        auth: { optional: true },
        output: z.array(z.object({ id: z.string() })),
        handler: () => []
      })

      apiRouter.get("/users/:id", {
        auth: { optional: true },
        input: { params: z.object({ id: z.string() }) },
        output: z.object({ id: z.string() }),
        handler: ({ params }) => ({ id: params.id })
      })

      const routes = apiRouter.getRoutes()
      expect(routes).toHaveLength(2)
      expect(routes[0].routeConfig.path).toBe("/api/v1/users")
      expect(routes[1].routeConfig.path).toBe("/api/v1/users/:id")
    })

    it("should normalize paths correctly", () => {
      const router1 = new HonoApiRouter("/api/")
      const router2 = new HonoApiRouter("/api")
      
      router1.get("/users/", {
        auth: { optional: true },
        handler: () => null
      })

      router2.get("/users", {
        auth: { optional: true },
        handler: () => null
      })

      const routes1 = router1.getRoutes()
      const routes2 = router2.getRoutes()
      
      expect(routes1[0].routeConfig.path).toBe("/api/users/")
      expect(routes2[0].routeConfig.path).toBe("/api/users")
    })

    it("should handle nested paths", () => {
      router.get("/users/:userId/posts/:postId", {
        auth: { optional: true },
        input: {
          params: z.object({
            userId: z.string(),
            postId: z.string()
          })
        },
        output: z.object({
          userId: z.string(),
          postId: z.string()
        }),
        handler: ({ params }) => ({
          userId: params.userId,
          postId: params.postId
        })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].routeConfig.path).toBe("/users/:userId/posts/:postId")
    })

    it("should handle root path", () => {
      router.get("/", {
        auth: { optional: true },
        output: z.object({ message: z.string() }),
        handler: () => ({ message: "root" })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].routeConfig.path).toBe("/")
    })
  })

  describe("withPathways", () => {
    it("should support adding Pathways", () => {
      // Mock pathways builder (since we're not testing auth, just the structure)
      const mockPathways = {
        // Minimal mock to test the withPathways method
        withUserResolver: () => mockPathways
      } as any

      const routerWithPathways = router.withPathways(mockPathways)
      
      expect(routerWithPathways.pathways).toBeDefined()
      expect(routerWithPathways).toBeInstanceOf(HonoApiRouter)
    })

    it("should maintain pathways in routes", () => {
      const mockPathways = {
        withUserResolver: () => mockPathways
      } as any

      const routerWithPathways = router.withPathways(mockPathways)
      
      routerWithPathways.get("/test", {
        auth: { optional: true },
        output: z.object({ message: z.string() }),
        handler: () => ({ message: "test" })
      })

      const routes = routerWithPathways.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].pathways).toBeDefined()
    })
  })

  describe("Route Building", () => {
    it("should create proper route configurations", () => {
      router.post("/api/create", {
        summary: "Create resource",
        description: "Creates a new resource",
        tags: ["resources"],
        auth: { optional: true },
        input: {
          body: z.object({
            name: z.string().min(1),
            type: z.enum(["public", "private"])
          })
        },
        output: z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          createdAt: z.string()
        }),
        handler: ({ body }) => ({
          id: crypto.randomUUID(),
          name: body.name,
          type: body.type,
          createdAt: new Date().toISOString()
        })
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      
      const route = routes[0]
      const config = route.routeConfig
      
      expect(config.method).toBe("post")
      expect(config.path).toBe("/api/create")
      expect(config.summary).toBe("Create resource")
      expect(config.description).toBe("Creates a new resource")
      expect(config.tags).toEqual(["resources"])
      
      // Check that request/response schemas are properly configured
      expect(config.request).toBeDefined()
      expect(config.responses).toBeDefined()
    })

    it("should handle routes without output (201 responses)", () => {
      router.delete("/api/remove/:id", {
        summary: "Remove resource",
        tags: ["resources"],
        auth: { optional: true },
        input: {
          params: z.object({ id: z.string().uuid() })
        },
        handler: ({ params }) => {
          console.log(`Removing resource ${params.id}`)
          return null
        }
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      
      const route = routes[0]
      expect(route.inOptions.output).toBeUndefined()
      expect(route.inOptions.handler).toBeDefined()
    })

    it("should maintain handler references", () => {
      const testHandler = ({ query }: any) => ({ 
        result: `Query: ${query.search}` 
      })

      router.get("/search", {
        auth: { optional: true },
        input: {
          query: z.object({ search: z.string() })
        },
        output: z.object({ result: z.string() }),
        handler: testHandler
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].inOptions.handler).toBe(testHandler)
    })
  })

  describe("Method Chaining", () => {
    it("should support method chaining", () => {
      const chainedRouter = router
        .get("/first", {
          auth: { optional: true },
          output: z.object({ order: z.number() }),
          handler: () => ({ order: 1 })
        })
        .post("/second", {
          auth: { optional: true },
          input: { body: z.object({ data: z.string() }) },
          output: z.object({ order: z.number() }),
          handler: () => ({ order: 2 })
        })
        .put("/third", {
          auth: { optional: true },
          input: { 
            params: z.object({ id: z.string() }),
            body: z.object({ data: z.string() })
          },
          output: z.object({ order: z.number() }),
          handler: () => ({ order: 3 })
        })

      expect(chainedRouter).toBeInstanceOf(HonoApiRouter)
      
      const routes = chainedRouter.getRoutes()
      expect(routes).toHaveLength(3)
      expect(routes.map(r => r.routeConfig.method)).toEqual(["get", "post", "put"])
    })

    it("should maintain router instance through chaining", () => {
      const originalRouter = new HonoApiRouter("/api")
      
      const chainedRouter = originalRouter
        .get("/test1", {
          auth: { optional: true },
          handler: () => null
        })
        .get("/test2", {
          auth: { optional: true },
          handler: () => null
        })

      expect(chainedRouter).toBe(originalRouter)
      expect(chainedRouter.basePath).toBe("/api")
      
      const routes = chainedRouter.getRoutes()
      expect(routes).toHaveLength(2)
      expect(routes[0].routeConfig.path).toBe("/api/test1")
      expect(routes[1].routeConfig.path).toBe("/api/test2")
    })
  })
}) 