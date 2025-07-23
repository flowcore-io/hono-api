/**
 * @fileoverview Flowcore Hono API Builder
 * 
 * For trace-log correlation to work properly:
 * 1. Initialize OTEL SDK FIRST: import init from "@flowcore/hono-api/otel"
 * 2. Call init() before any logger creation
 * 3. Use loggerFactory to create loggers - WinstonInstrumentation handles correlation automatically
 * 
 * @example
 * ```typescript
 * // ✅ CORRECT initialization order
 * import init from "@flowcore/hono-api/otel"
 * 
 * init({ otelServiceName: "my-api", otelEndpoint: "http://localhost:4317", runtime: "bun" })
 * 
 * import { HonoApi, HonoApiRouter, loggerFactory } from "@flowcore/hono-api"
 * const createLogger = loggerFactory({ prettyPrintLogs: true, logLevel: "info" }).createLogger
 * ```
 */

export * from "./auth/authenticate.ts"
export * from "./auth/authorize.ts"
export * from "./exceptions/app-exceptions.ts"
export * from "./lib/environment.ts"
export * from "./lib/hono-api-router.ts"
export * from "./lib/hono-api.ts"
export * from "./lib/logger.ts"
export * from "./lib/try-catch.ts"
export * from "./lib/zod-types.ts"
export * from "./types/types.ts"

import "./otel/mod.ts"
