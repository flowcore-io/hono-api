import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose"
import type { Logger } from "../lib/logger.ts"
import { AppExceptionUnauthorized } from "./../exceptions/app-exceptions.ts"
import { AuthType } from "./../types/types.ts"

export type FlowcoreJWTPayload = JWTPayload & {
  flowcore_user_id: string
  email: string
  is_flowcore_admin?: boolean
}

export interface AuthenticatedUser {
  type: "bearer"
  id: string
  email: string
  isFlowcoreAdmin: boolean
}

export interface AuthenticatedApiKey {
  type: "apiKey"
  id: string
  isFlowcoreAdmin: boolean
}

export type Authenticated = AuthenticatedUser | AuthenticatedApiKey

export type MaybeAuthenticated = Authenticated | undefined

// Generic JWT payload validation configuration
export interface JWTValidationConfig {
  /**
   * Extract user ID from JWT payload
   * @param payload The decoded JWT payload
   * @returns The user ID string, or throws if invalid
   */
  extractUserId: (payload: JWTPayload) => string

  /**
   * Extract email from JWT payload (optional)
   * @param payload The decoded JWT payload
   * @returns The email string or undefined
   */
  extractEmail?: (payload: JWTPayload) => string | undefined

  /**
   * Extract admin status from JWT payload (optional)
   * @param payload The decoded JWT payload
   * @returns Whether the user is an admin
   */
  extractIsAdmin?: (payload: JWTPayload) => boolean

  /**
   * Additional validation logic (optional)
   * @param payload The decoded JWT payload
   * @throws AppExceptionUnauthorized if validation fails
   */
  validatePayload?: (payload: JWTPayload) => void
}

// Default Flowcore configuration for backward compatibility
export const FLOWCORE_JWT_CONFIG: JWTValidationConfig = {
  extractUserId: (payload: JWTPayload): string => {
    const flowcorePayload = payload as FlowcoreJWTPayload
    if (!flowcorePayload.flowcore_user_id) {
      throw new AppExceptionUnauthorized("Missing flowcore_user_id in JWT payload")
    }
    return flowcorePayload.flowcore_user_id
  },
  extractEmail: (payload: JWTPayload): string | undefined => {
    const flowcorePayload = payload as FlowcoreJWTPayload
    return flowcorePayload.email
  },
  extractIsAdmin: (payload: JWTPayload): boolean => {
    const flowcorePayload = payload as FlowcoreJWTPayload
    return flowcorePayload.is_flowcore_admin ?? false
  },
}

// Generic OIDC configuration factory for standard claims
export function createOIDCConfig(options: {
  userIdClaim?: string
  emailClaim?: string
  adminClaim?: string
  adminValue?: unknown
  requiredClaims?: string[]
}): JWTValidationConfig {
  const {
    userIdClaim = "sub",
    emailClaim = "email",
    adminClaim,
    adminValue = true,
    requiredClaims = [],
  } = options

  return {
    extractUserId: (payload) => {
      const userId = payload[userIdClaim]
      if (!userId || typeof userId !== "string") {
        throw new AppExceptionUnauthorized(`Missing or invalid ${userIdClaim} in JWT payload`)
      }
      return userId
    },
    extractEmail: (payload) => {
      const email = payload[emailClaim]
      return typeof email === "string" ? email : undefined
    },
    extractIsAdmin: adminClaim
      ? (payload) => {
        return payload[adminClaim] === adminValue
      }
      : () => false,
    validatePayload: requiredClaims.length > 0
      ? (payload) => {
        for (const claim of requiredClaims) {
          if (!(claim in payload)) {
            throw new AppExceptionUnauthorized(`Missing required claim: ${claim}`)
          }
        }
      }
      : undefined,
  }
}

export async function authenticate(
  logger: Logger,
  jwksUrl: string,
  apiKeyUrl: string,
  authorizationHeader?: string,
  allowedAuthTypes?: AuthType[],
  jwtConfig: JWTValidationConfig = FLOWCORE_JWT_CONFIG,
): Promise<MaybeAuthenticated> {
  const authTypes = allowedAuthTypes ?? [AuthType.Bearer, AuthType.ApiKey]

  if (!authorizationHeader) {
    return undefined
  }

  if (authorizationHeader.startsWith("Bearer ") && authTypes.includes(AuthType.Bearer)) {
    const jwks = createRemoteJWKSet(new URL(jwksUrl))
    const token = authorizationHeader.slice(7)
    const decoded = await jwtVerify(token, jwks).catch((error) => {
      logger.error(error)
      throw new AppExceptionUnauthorized(error.message)
    })

    try {
      // Apply custom validation if provided
      if (jwtConfig.validatePayload) {
        jwtConfig.validatePayload(decoded.payload)
      }

      const id = jwtConfig.extractUserId(decoded.payload)
      const email = jwtConfig.extractEmail?.(decoded.payload) ?? ""
      const isFlowcoreAdmin = jwtConfig.extractIsAdmin?.(decoded.payload) ?? false

      return {
        type: "bearer",
        id,
        email,
        isFlowcoreAdmin,
      }
    } catch (error: unknown) {
      if (error instanceof AppExceptionUnauthorized) {
        throw error
      }
      logger.error(error instanceof Error ? error : String(error))
      throw new AppExceptionUnauthorized("JWT payload validation failed")
    }
  }

  if (authorizationHeader.startsWith("ApiKey ") && authTypes.includes(AuthType.ApiKey)) {
    const [apiKeyId, apiKey] = authorizationHeader.slice(7).split(":")
    const response = await fetch(`${apiKeyUrl}/validate-organization-api-key`, {
      method: "POST",
      body: JSON.stringify({
        apiKeyId,
        apiKey,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new AppExceptionUnauthorized()
    }

    const result = (await response.json()) as {
      valid: boolean
      keyId: string
    }

    if (!result.valid) {
      throw new AppExceptionUnauthorized()
    }

    return {
      type: "apiKey",
      id: result.keyId,
      isFlowcoreAdmin: false,
    }
  }

  throw new AppExceptionUnauthorized()
}
