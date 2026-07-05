import { assertEquals, assertRejects } from "jsr:@std/assert"
import { afterEach, describe, it } from "jsr:@std/testing/bdd"
import { authenticate } from "../src/auth/authenticate.ts"
import { AppExceptionUnauthorized } from "../src/exceptions/app-exceptions.ts"

const JWKS_URL = "https://auth.example.com/certs"
const API_KEY_URL = "https://security-key.example.com"
const TENANT_STORE_URL = "https://tenant-store.example.com"

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Console

type RecordedCall = { url: string; body: Record<string, unknown> }

function stubFetch(response: Record<string, unknown>, calls: RecordedCall[]) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: input.toString(),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : {},
    })
    return Promise.resolve(Response.json(response))
  }) as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

describe("authenticate (api keys)", () => {
  let restore: (() => void) | undefined

  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it("validates a single-token fc_ key against the tenant-store with body { apiKey }", async () => {
    const calls: RecordedCall[] = []
    restore = stubFetch({ valid: true, apiKeyId: "canonical-id" }, calls)

    const result = await authenticate(
      logger,
      JWKS_URL,
      API_KEY_URL,
      "ApiKey fc_key-id_secret",
      undefined,
      undefined,
      TENANT_STORE_URL,
    )

    assertEquals(result, { type: "apiKey", id: "canonical-id", isFlowcoreAdmin: false })
    assertEquals(calls.length, 1)
    assertEquals(calls[0].url, `${TENANT_STORE_URL}/api/v1/api-keys/validate`)
    assertEquals(calls[0].body, { apiKey: "fc_key-id_secret" })
  })

  it("routes the legacy header form carrying a full fc_ key to the tenant-store without re-wrapping", async () => {
    const calls: RecordedCall[] = []
    restore = stubFetch({ valid: true, apiKeyId: "key-id" }, calls)

    const result = await authenticate(
      logger,
      JWKS_URL,
      API_KEY_URL,
      "ApiKey key-id:fc_key-id_secret",
      undefined,
      undefined,
      TENANT_STORE_URL,
    )

    assertEquals(result?.id, "key-id")
    assertEquals(calls.length, 1)
    assertEquals(calls[0].url, `${TENANT_STORE_URL}/api/v1/api-keys/validate`)
    // Must be the bare fc_ key — not "key-id:fc_..." and not "fc_key-id_fc_...".
    assertEquals(calls[0].body, { apiKey: "fc_key-id_secret" })
  })

  it("falls back to the header-parsed key id when the tenant-store omits apiKeyId", async () => {
    const calls: RecordedCall[] = []
    restore = stubFetch({ valid: true }, calls)

    const result = await authenticate(
      logger,
      JWKS_URL,
      API_KEY_URL,
      "ApiKey fc_parsed-id_secret",
      undefined,
      undefined,
      TENANT_STORE_URL,
    )

    assertEquals(result?.id, "parsed-id")
  })

  it("rejects an fc_ key when the tenant-store returns valid:false", async () => {
    const calls: RecordedCall[] = []
    restore = stubFetch({ valid: false, reason: "Invalid API key" }, calls)

    await assertRejects(
      () =>
        authenticate(
          logger,
          JWKS_URL,
          API_KEY_URL,
          "ApiKey fc_key-id_secret",
          undefined,
          undefined,
          TENANT_STORE_URL,
        ),
      AppExceptionUnauthorized,
    )
  })

  it("keeps legacy non-fc_ keys on the validate-organization-api-key path", async () => {
    const calls: RecordedCall[] = []
    restore = stubFetch({ valid: true, keyId: "legacy-id" }, calls)

    const result = await authenticate(
      logger,
      JWKS_URL,
      API_KEY_URL,
      "ApiKey legacy-id:plain-secret",
      undefined,
      undefined,
      TENANT_STORE_URL,
    )

    assertEquals(result, { type: "apiKey", id: "legacy-id", isFlowcoreAdmin: false })
    assertEquals(calls.length, 1)
    assertEquals(calls[0].url, `${API_KEY_URL}/validate-organization-api-key`)
    assertEquals(calls[0].body, { apiKeyId: "legacy-id", apiKey: "plain-secret" })
  })

  it("keeps fc_ keys on the legacy path when no tenantStoreUrl is configured", async () => {
    const calls: RecordedCall[] = []
    restore = stubFetch({ valid: true, keyId: "key-id" }, calls)

    const result = await authenticate(
      logger,
      JWKS_URL,
      API_KEY_URL,
      "ApiKey key-id:fc_key-id_secret",
    )

    assertEquals(result?.id, "key-id")
    assertEquals(calls[0].url, `${API_KEY_URL}/validate-organization-api-key`)
  })
})
