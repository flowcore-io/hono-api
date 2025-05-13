import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose"
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
}

export type Authenticated = AuthenticatedUser | AuthenticatedApiKey

export type MaybeAuthenticated = Authenticated | undefined

export async function authenticate(
  jwksUrl: string,
  apiKeyUrl: string,
  authorizationHeader?: string,
  allowedAuthTypes?: AuthType[],
): Promise<MaybeAuthenticated> {
  const authTypes = allowedAuthTypes ?? [AuthType.Bearer, AuthType.ApiKey]

  if (!authorizationHeader) {
    return undefined
  }

  if (authorizationHeader.startsWith("Bearer ") && authTypes.includes(AuthType.Bearer)) {
    const jwks = createRemoteJWKSet(new URL(jwksUrl))
    const token = authorizationHeader.slice(7)
    const decoded = await jwtVerify<FlowcoreJWTPayload>(token, jwks).catch((error) => {
      console.error(error)
      throw new AppExceptionUnauthorized(error.message)
    })
    if (!decoded.payload?.flowcore_user_id) {
      throw new AppExceptionUnauthorized()
    }
    return {
      type: "bearer",
      id: decoded.payload.flowcore_user_id,
      email: decoded.payload.email,
      isFlowcoreAdmin: decoded.payload.is_flowcore_admin ?? false,
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
    }
  }

  throw new AppExceptionUnauthorized()
}
