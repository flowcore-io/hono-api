import type { ZodError } from "zod"
import type { AuthorizePayload } from "./../auth/authorize.ts"

export abstract class AppException extends Error {
  public abstract readonly status: 400 | 401 | 403 | 404 | 500
  public abstract readonly code: string
}

export class AppExceptionNotFound extends AppException {
  public readonly status = 404
  public readonly code = "NOT_FOUND"

  constructor(resource: string, prop: string, value: string) {
    super(`${resource} not found with ${prop} = ${value}`)
  }
}

export class AppExceptionForbidden extends AppException {
  public readonly status = 403
  public readonly code = "FORBIDDEN"
  public readonly validPolicies?: { policyFrn: string; statementId: string }[]
  public readonly invalidRequest?: AuthorizePayload[]

  constructor(
    message?: string,
    validPolicies?: { policyFrn: string; statementId: string }[],
    invalidRequest?: AuthorizePayload[],
  ) {
    super(message ?? "Forbidden")
    this.validPolicies = validPolicies
    this.invalidRequest = invalidRequest
  }
}

export class AppExceptionUnauthorized extends AppException {
  public readonly status = 401
  public readonly code = "UNAUTHORIZED"

  constructor(message?: string) {
    super(message ?? "Unauthorized")
  }
}

export class AppExceptionBadRequest extends AppException {
  public readonly status = 400
  public readonly code = "BAD_REQUEST"
  public readonly in?: string
  public readonly errors?: Record<string, string>

  constructor(zodError?: ZodError, target?: string, message?: string) {
    super(message ?? "Bad Request")
    if (zodError && target) {
      this.in = target
      this.errors = zodError.issues.reduce(
        (acc, issue) => {
          acc[issue.path.join(".")] = issue.message
          return acc
        },
        {} as Record<string, string>,
      )
    }
  }
}
