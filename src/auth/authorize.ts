import type { Logger } from "../types/types.ts"
import { AppExceptionForbidden } from "./../exceptions/app-exceptions.ts"
import type { Authenticated } from "./authenticate.ts"
import { AuthCache } from "./cache.ts"

const authCache = new AuthCache({
  ttlMs: 300_000,
})

export interface AuthorizePayload {
  action: string | string[]
  resource: string[]
}

interface IamValidationResponseValid {
  valid: true
  validPolicies: { policyFrn: string; statementId: string }[]
  checksum: string
}

interface IamValidationResponseInvalid {
  valid: false
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

  const checksum = await authCache.hash(JSON.stringify(payload))
  const localChecksum = await authCache.get(`${auth.id}-${checksum}`)
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
    await authCache.set(`${auth.id}-${data.checksum}`, true).catch(options.logger.warn)
    options.logger.debug(`IAM validation passed for ${options.type} ${auth.id} with checksum ${data.checksum}`)
  } else {
    options.logger.info("IAM validation failed", { data })
    throw new AppExceptionForbidden("IAM validation failed", data.validPolicies, data.invalidRequest)
  }
}
