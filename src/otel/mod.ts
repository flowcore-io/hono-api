import type { NodeSDK } from "@opentelemetry/sdk-node"
import { getOtelNodeSdk as getOtelNodeSdkFn } from "./../lib/otel-node-sdk.ts"

let otelNodeSdk: NodeSDK | undefined

/**
 * Initialize OpenTelemetry SDK with Winston instrumentation.
 *
 * ⚠️ CRITICAL: Must be called BEFORE any logger creation or HTTP server startup
 *
 * @example
 * ```typescript
 * // main.ts or app.ts - FIRST THING IN APPLICATION
 * import init from "@flowcore/hono-api/otel"
 *
 * // Initialize OTEL before any other imports
 * init({
 *   otelServiceName: "my-service",
 *   otelEndpoint: "http://localhost:4317",
 *   runtime: "bun" // or "node" | "deno"
 * })
 *
 * // Now safe to import and use loggers
 * import { loggerFactory } from "@flowcore/hono-api"
 * const createLogger = loggerFactory({ prettyPrintLogs: true, logLevel: "info" }).createLogger
 * const logger = createLogger("main")
 * ```
 */
export default function init({
  otelServiceName,
  otelEndpoint,
  runtime,
}: {
  otelServiceName?: string
  otelEndpoint?: string
  runtime?: "node" | "bun" | "deno"
}): void {
  if (otelNodeSdk) {
    throw new Error("Otel already initialized")
  }
  otelNodeSdk = getOtelNodeSdkFn({
    otelServiceName,
    otelEndpoint,
    runtime,
  })

  otelNodeSdk.start()
}

export function getOtelNodeSdk(): NodeSDK | undefined {
  return otelNodeSdk
}
