import { NodeSDK } from "@opentelemetry/sdk-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch"
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston"

export function getOtelNodeSdk(
  { otelServiceName, otelEndpoint, runtime }: {
    otelServiceName?: string
    otelEndpoint?: string
    runtime?: "node" | "bun" | "deno"
  },
): NodeSDK {
  if (!otelServiceName) {
    throw new Error("otelServiceName is required")
  }
  if (!otelEndpoint) {
    throw new Error("otelEndpoint is required")
  }
  if (!runtime) {
    throw new Error("runtime is required")
  }
  const sdk = new NodeSDK({
    serviceName: otelServiceName,
    traceExporter: new OTLPTraceExporter({
      url: `${otelEndpoint}/v1/traces`,
      headers: { "Content-Type": "application/json" },
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
      new FetchInstrumentation({
        applyCustomAttributesOnSpan: (span: unknown) => {
          if (span && typeof span === "object" && "setAttribute" in span) {
            ;(span as { setAttribute: (key: string, value: string) => void }).setAttribute("runtime", runtime)
          }
        },
      }),
      new WinstonInstrumentation({
        enabled: true,
        logHook: (span, record) => {
          record.trace_id = span.spanContext().traceId
          record.span_id = span.spanContext().spanId
        },
      }),
    ],
  })
  return sdk
}
