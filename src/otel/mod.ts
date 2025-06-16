import type { NodeSDK } from "@opentelemetry/sdk-node"
import { getOtelNodeSdk as getOtelNodeSdkFn } from "./../lib/otel-node-sdk.ts"

let otelNodeSdk: NodeSDK | undefined

export default function init({
  otelServiceName,
  otelEndpoint,
  runtime,
}: {
  otelServiceName?: string
  otelEndpoint?: string
  runtime?: "node" | "bun" | "deno"
}) {
  if (otelNodeSdk) {
    throw new Error("Otel already initialized")
  }
  otelNodeSdk = getOtelNodeSdkFn({
    otelServiceName,
    otelEndpoint,
    runtime,
  })
}

export function getOtelNodeSdk() {
  if (!otelNodeSdk) {
    throw new Error("Otel not initialized")
  }
  return otelNodeSdk
}
