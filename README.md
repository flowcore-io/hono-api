# Flowcore Hono API Builder

## Usage

```ts
import { HonoApi, HonoApiRouter } from "../src/mod.ts"
import { z } from "@hono/zod-openapi"

// root-router.ts
const rootRouter = new HonoApiRouter()
rootRouter.get("/health", {
  tags: ["root"],
  auth: {
    optional: true,
  },
  output: z.object({
    status: z.enum(["ok", "error"]).openapi({
      example: "ok",
    }),
  }),
  handler: () => {
    return {
      status: "ok" as const,
    }
  },
})

// data-cores-router.ts
const apiV1DataCoreRouter = new HonoApiRouter()
apiV1DataCoreRouter.post("/", {
  summary: "Create a data core",
  description: "Create a data core",
  tags: ["data-core"],
  auth: {
    permissions: (input) => {
      return [{
        action: "write",
        resource: [`frn::${input.body.tenantId}:data-core:*`],
      }]
    },
  },
  input: {
    body: z.object({
      name: z.string().openapi({
        example: "my-data-core",
      }),
      tenantId: z.string().openapi({
        example: "00000000-0000-0000-0000-000000000000",
        description: "The ID of the tenant to create the data core on",
      }),
    }),
  },
  output: z.object({
    id: z.string(),
    name: z.string(),
    tenantId: z.string(),
  }),
  handler: (input) => {
    return {
      id: crypto.randomUUID(),
      name: input.body.name,
      tenantId: input.body.tenantId,
    }
  },
})

// Hono API
const honoApi = new HonoApi({
  // Auth is optional (These are the defaults)
  auth: {
    jwks_url: "https://auth.flowcore.io/realms/flowcore/protocol/openid-connect/certs",
    api_key_url: "https://iam.api.flowcore.io",
    iam_url: "https://iam.api.flowcore.io",
  },
  // OpenAPI is optional (These are the defaults)
  openapi: {
    docPath: "/swagger",
    jsonPath: "/swagger/openapi.json",
    version: "0.0.1",
    name: "Hono API",
    description: "Hono API",
  },
  // Logger is optional (This is the default)
  logger: console,
})

honoApi.addRouter("/", rootRouter)
honoApi.addRouter("/api/v1/data-cores", apiV1DataCoreRouter)

// Serve your api in your preferred manner
Deno.serve({ port: 3000 }, honoApi.app.fetch)

Bun.serve({
  port: 3000,
  fetch: honoApi.app.fetch
})
```