# Flowcore Hono API Builder

## OpenTelemetry Trace-Log Correlation

For trace-log correlation to work properly, **initialization order is critical**:

### ✅ Correct Setup

```ts
// main.ts - FIRST THING IN APPLICATION
import init from "@flowcore/hono-api/otel"

// Initialize OTEL before any other imports
init({
  otelServiceName: "my-api",
  otelEndpoint: "http://localhost:4318", // OTLP HTTP endpoint
  runtime: "bun" // or "node" | "deno"
})

// Now safe to import and use the library
import { HonoApi, HonoApiRouter, loggerFactory } from "@flowcore/hono-api"
import { z } from "@hono/zod-openapi"

// Create logger with trace correlation
const createLogger = loggerFactory({
  prettyPrintLogs: true,
  logLevel: "info"
}).createLogger

const logger = createLogger("main")

// Your logs will now include trace_id and span_id automatically
logger.info("Application starting", { port: 3000 })
```

### ❌ Common Mistakes

```ts
// WRONG: Creating logger before OTEL initialization
import { loggerFactory } from "@flowcore/hono-api"
const logger = loggerFactory(...).createLogger("main") // No trace correlation!

import init from "@flowcore/hono-api/otel"
init({ ... }) // Too late - logger already created
```

### Environment Variables

| Variable | Type | Description | Default | Required |
|----------|------|-------------|----------|----------|
| OTEL_SERVICE_NAME | string | Service name for traces | - | ✓ |
| OTEL_EXPORTER_OTLP_ENDPOINT | string | OTLP endpoint URL | - | ✓ |

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

## Testing

The project includes comprehensive tests for the API functionality:

```bash
# Run all tests
deno task test

# Run tests in watch mode
deno task test:watch

# Run tests with coverage
deno task test:coverage

# Type check all files
deno task typecheck
```

### Test Coverage

The test suite covers:

- **HonoApi Class**: Initialization, configuration, router mounting, request handling
- **HonoApiRouter Class**: Route registration, path handling, HTTP methods, configuration
- **Exception Classes**: All error types with proper status codes and serialization
- **Request/Response Handling**: GET, POST, PUT, PATCH, DELETE methods
- **Input Validation**: Headers, query parameters, path parameters, request bodies
- **OpenAPI Documentation**: Spec generation and documentation serving
- **Prometheus Metrics**: Metrics collection and endpoint protection
- **Error Handling**: Internal server errors and custom exceptions

Authentication tests are excluded as requested, but can be added separately if needed.