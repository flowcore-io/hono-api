import { assertEquals, assertRejects } from "@std/assert"
import { afterEach, describe, it } from "@std/testing/bdd"
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import { __resetJwksCacheForTests, authenticate } from "../src/auth/authenticate.ts"
import { AppExceptionUnauthorized } from "../src/exceptions/app-exceptions.ts"

const JWKS_URL = "https://auth.example.com/certs"
const API_KEY_URL = "https://security-key.example.com"

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Console

/**
 * Stand up a real RS256 key pair, a matching JWKS document and a signed token,
 * so the JWKS path is exercised end to end rather than mocked away.
 */
async function jwtFixture() {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true })
  const jwk = await exportJWK(publicKey)
  jwk.kid = "test-key"
  jwk.alg = "RS256"
  jwk.use = "sig"

  const token = await new SignJWT({ flowcore_user_id: "user-1", email: "user@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey)

  return { jwksDocument: { keys: [jwk] }, token }
}

/** Counts JWKS fetches so we can prove the remote key set is reused. */
function stubJwksFetch(jwksDocument: unknown) {
  const originalFetch = globalThis.fetch
  const state = { jwksFetches: 0 }
  globalThis.fetch = ((input: RequestInfo | URL) => {
    if (input.toString() === JWKS_URL) {
      state.jwksFetches++
      return Promise.resolve(Response.json(jwksDocument))
    }
    return Promise.reject(new Error(`unexpected fetch: ${input}`))
  }) as typeof fetch
  return {
    state,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

describe("authenticate (jwks)", () => {
  let restore: (() => void) | undefined

  afterEach(() => {
    restore?.()
    restore = undefined
    __resetJwksCacheForTests()
  })

  it("fetches the JWKS document once across many verifications", async () => {
    const { jwksDocument, token } = await jwtFixture()
    const stub = stubJwksFetch(jwksDocument)
    restore = stub.restore

    for (let i = 0; i < 5; i++) {
      const result = await authenticate(logger, JWKS_URL, API_KEY_URL, `Bearer ${token}`)
      assertEquals(result?.id, "user-1")
    }

    // Before this fix a new remote key set was built per request, so every
    // request left the cluster to re-fetch the same immutable document.
    assertEquals(stub.state.jwksFetches, 1)
  })

  it("reuses the remote key set for the same URL across concurrent requests", async () => {
    const { jwksDocument, token } = await jwtFixture()
    const stub = stubJwksFetch(jwksDocument)
    restore = stub.restore

    const results = await Promise.all(
      Array.from({ length: 10 }, () => authenticate(logger, JWKS_URL, API_KEY_URL, `Bearer ${token}`)),
    )

    assertEquals(results.every((r) => r?.id === "user-1"), true)
    assertEquals(stub.state.jwksFetches, 1)
  })

  it("keeps separate key sets per JWKS URL", async () => {
    const { jwksDocument, token } = await jwtFixture()
    const originalFetch = globalThis.fetch
    const urls: string[] = []
    globalThis.fetch = ((input: RequestInfo | URL) => {
      urls.push(input.toString())
      return Promise.resolve(Response.json(jwksDocument))
    }) as typeof fetch
    restore = () => {
      globalThis.fetch = originalFetch
    }

    await authenticate(logger, JWKS_URL, API_KEY_URL, `Bearer ${token}`)
    await authenticate(logger, "https://auth.other.example.com/certs", API_KEY_URL, `Bearer ${token}`)

    assertEquals(urls, [JWKS_URL, "https://auth.other.example.com/certs"])
  })

  it("gives up on a hanging JWKS endpoint instead of waiting forever", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      // Never resolves on its own — only the caller's abort signal ends it.
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
      })
    }) as typeof fetch
    restore = () => {
      globalThis.fetch = originalFetch
    }

    const { token } = await jwtFixture()

    await assertRejects(
      () =>
        authenticate(logger, JWKS_URL, API_KEY_URL, `Bearer ${token}`, undefined, undefined, undefined, {
          jwksTimeoutMs: 50,
        }),
      AppExceptionUnauthorized,
    )
  })
})
