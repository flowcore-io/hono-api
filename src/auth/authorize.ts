import type { Logger } from "../types/types.ts"
import { AppExceptionForbidden } from "./../exceptions/app-exceptions.ts"

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

export async function authorize(
  logger: Logger,
  iamUrl: string,
  type: "users" | "keys",
  id: string,
  payload: AuthorizePayload[],
): Promise<void> {
  const response = await fetch(`${iamUrl}/api/v1/validate/${type}/${id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "tenant",
      requestedAccess: payload,
    }),
  })

  const data = (await response.json()) as IamValidationResponse

  if (data.valid) {
    // this.hashMap.set(`${id}-${data.checksum}`, true)
    logger.debug(`IAM validation passed for ${type} ${id} with checksum ${data.checksum}`)
  } else {
    logger.info("IAM validation failed", { data })
    throw new AppExceptionForbidden("IAM validation failed", data.validPolicies, data.invalidRequest)
  }
}
