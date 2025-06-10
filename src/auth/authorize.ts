import { z } from "@hono/zod-openapi"
import type { Logger } from "../lib/logger.ts"
import { AppExceptionForbidden } from "./../exceptions/app-exceptions.ts"
import type { Authenticated } from "./authenticate.ts"
import { AuthCache } from "./cache.ts"

let _authCache: AuthCache | undefined
export function getAuthCache(logger: Logger): AuthCache {
  if (!_authCache) {
    _authCache = new AuthCache({
      ttlMs: 300_000,
      logger,
    })
  }
  return _authCache
}

export const AuthorizeValidPoliciesSchema: z.ZodObject<{
  policyFrn: z.ZodString
  statementId: z.ZodString
}> = z.object({
  policyFrn: z.string(),
  statementId: z.string(),
})
  .openapi("AuthorizeValidPolicy", {
    example: {
      policyFrn: "frn::tenant:policy",
      statementId: "123",
    },
  })

export const AuthorizePayloadSchema: z.ZodObject<{
  action: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString>]>
  resource: z.ZodArray<z.ZodString>
}> = z.object({
  action: z.string().or(z.array(z.string())),
  resource: z.array(z.string()),
})
  .openapi("AuthorizePayload", {
    example: {
      action: "read",
      resource: ["frn::tenant:resource"],
    },
  })

export type AuthorizePayload = z.infer<typeof AuthorizePayloadSchema>

interface IamValidationResponseValid {
  valid: true
  validPolicies: { policyFrn: string; statementId: string }[]
  checksum: string
}

interface IamValidationResponseInvalid {
  valid: false
  status?: number
  message?: string
  invalidRequest: AuthorizePayload[]
  validPolicies: { policyFrn: string; statementId: string }[]
}

export type IamValidationResponse = IamValidationResponseValid | IamValidationResponseInvalid

interface AuthorizeOptions {
  iamUrl: string
  allowFlowcoreAdmin?: boolean
  type: "users" | "keys"
  mode: "tenant" | "organization"
  logger: Logger
}

export async function authorize(
  auth: Authenticated,
  payload: AuthorizePayload[],
  options: AuthorizeOptions,
): Promise<void> {
  // Check if we should allow flowcore admin
  if (options.allowFlowcoreAdmin && auth.type === "bearer" && auth.isFlowcoreAdmin) {
    return
  }

  const checksum = await getAuthCache(options.logger).hash(JSON.stringify(payload))
  const localChecksum = await getAuthCache(options.logger).get(`${auth.id}-${checksum}`)
  if (localChecksum === true) {
    return
  }

  const response = await fetch(`${options.iamUrl}/api/v1/validate/${options.type}/${auth.id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: options.mode,
      requestedAccess: payload,
    }),
  })

  const data = (await response.json()) as IamValidationResponse

  if (data.valid) {
    await getAuthCache(options.logger).set(`${auth.id}-${data.checksum}`, true).catch(options.logger.warn)
    options.logger.debug(`IAM validation passed for ${options.type} ${auth.id} with checksum ${data.checksum}`)
  } else {
    options.logger.info("IAM validation failed", { data })
    throw new AppExceptionForbidden(
      data.message?.trim() || "IAM validation failed",
      data.validPolicies,
      data.invalidRequest,
    )
  }
}
