import { expect } from "jsr:@std/expect"
import { describe, it } from "jsr:@std/testing/bdd"
import { ZodError, type ZodIssue } from "zod"
import {
  AppExceptionBadRequest,
  AppExceptionConflict,
  AppExceptionForbidden,
  AppExceptionInternalServerError,
  AppExceptionNotFound,
  AppExceptionUnauthorized,
} from "../src/exceptions/app-exceptions.ts"

describe("App Exceptions", () => {
  describe("AppExceptionInternalServerError", () => {
    it("should create exception with default message", () => {
      const exception = new AppExceptionInternalServerError()

      expect(exception).toBeInstanceOf(Error)
      expect(exception.status).toBe(500)
      expect(exception.code).toBe("INTERNAL_SERVER_ERROR")
      expect(exception.message).toBe("Internal Server Error")
      expect(exception.originalError).toBeUndefined()
    })

    it("should create exception with original error", () => {
      const originalError = new Error("Database connection failed")
      const exception = new AppExceptionInternalServerError(originalError)

      expect(exception.status).toBe(500)
      expect(exception.code).toBe("INTERNAL_SERVER_ERROR")
      expect(exception.message).toBe("Internal Server Error")
      expect(exception.originalError).toBe(originalError)
      expect(exception.cause).toBe(originalError)
    })
  })

  describe("AppExceptionNotFound", () => {
    it("should create exception with resource details", () => {
      const exception = new AppExceptionNotFound("User", "id", "123")

      expect(exception).toBeInstanceOf(Error)
      expect(exception.status).toBe(404)
      expect(exception.code).toBe("NOT_FOUND")
      expect(exception.message).toBe("User not found with id = 123")
    })

    it("should handle different resource types", () => {
      const exception1 = new AppExceptionNotFound("DataCore", "name", "my-core")
      const exception2 = new AppExceptionNotFound("FlowType", "uuid", "abc-123")

      expect(exception1.message).toBe("DataCore not found with name = my-core")
      expect(exception2.message).toBe("FlowType not found with uuid = abc-123")
    })
  })

  describe("AppExceptionForbidden", () => {
    it("should create exception with default message", () => {
      const exception = new AppExceptionForbidden()

      expect(exception).toBeInstanceOf(Error)
      expect(exception.status).toBe(403)
      expect(exception.code).toBe("FORBIDDEN")
      expect(exception.message).toBe("Forbidden")
      expect(exception.validPolicies).toBeUndefined()
      expect(exception.invalidRequest).toBeUndefined()
    })

    it("should create exception with custom message", () => {
      const exception = new AppExceptionForbidden("Access denied to this resource")

      expect(exception.message).toBe("Access denied to this resource")
    })

    it("should create exception with policy information", () => {
      const validPolicies = [
        { policyFrn: "frn::policy:read", statementId: "stmt-1" },
        { policyFrn: "frn::policy:write", statementId: "stmt-2" },
      ]
      const invalidRequest = [
        { action: "delete", resource: ["frn::resource:123"] },
      ] as any

      const exception = new AppExceptionForbidden(
        "Insufficient permissions",
        validPolicies,
        invalidRequest,
      )

      expect(exception.message).toBe("Insufficient permissions")
      expect(exception.validPolicies).toEqual(validPolicies)
      expect(exception.invalidRequest).toEqual(invalidRequest)
    })
  })

  describe("AppExceptionUnauthorized", () => {
    it("should create exception with default message", () => {
      const exception = new AppExceptionUnauthorized()

      expect(exception).toBeInstanceOf(Error)
      expect(exception.status).toBe(401)
      expect(exception.code).toBe("UNAUTHORIZED")
      expect(exception.message).toBe("Unauthorized")
    })

    it("should create exception with custom message", () => {
      const exception = new AppExceptionUnauthorized("Invalid token")

      expect(exception.message).toBe("Invalid token")
    })

    it("should handle authentication-specific messages", () => {
      const exceptions = [
        new AppExceptionUnauthorized("JWT token expired"),
        new AppExceptionUnauthorized("Invalid API key"),
        new AppExceptionUnauthorized("Missing authorization header"),
      ]

      expect(exceptions[0].message).toBe("JWT token expired")
      expect(exceptions[1].message).toBe("Invalid API key")
      expect(exceptions[2].message).toBe("Missing authorization header")
    })
  })

  describe("AppExceptionBadRequest", () => {
    it("should create exception with default message", () => {
      const exception = new AppExceptionBadRequest()

      expect(exception).toBeInstanceOf(Error)
      expect(exception.status).toBe(400)
      expect(exception.code).toBe("BAD_REQUEST")
      expect(exception.message).toBe("Bad Request")
      expect(exception.in).toBeUndefined()
      expect(exception.errors).toBeUndefined()
    })

    it("should create exception with custom message", () => {
      const exception = new AppExceptionBadRequest(undefined, undefined, "Invalid input data")

      expect(exception.message).toBe("Invalid input data")
    })

    it("should create exception with zod validation errors", () => {
      // Create a mock ZodError
      const zodIssues: ZodIssue[] = [
        {
          code: "invalid_type",
          expected: "string",
          received: "number",
          path: ["name"],
          message: "Expected string, received number",
        },
        {
          code: "too_small",
          minimum: 1,
          type: "string",
          inclusive: true,
          path: ["email"],
          message: "String must contain at least 1 character(s)",
        },
        {
          code: "invalid_string",
          validation: "email",
          path: ["email"],
          message: "Invalid email",
        },
      ]

      const zodError = new ZodError(zodIssues)
      const exception = new AppExceptionBadRequest(zodError, "body", "Validation failed")

      expect(exception.message).toBe("Validation failed")
      expect(exception.in).toBe("body")
      expect(exception.errors).toEqual({
        "name": "Expected string, received number",
        "email": "Invalid email", // Takes the last error for the same field
      })
    })

    it("should handle nested path validation errors", () => {
      const zodIssues: ZodIssue[] = [
        {
          code: "invalid_type",
          expected: "string",
          received: "undefined",
          path: ["user", "profile", "name"],
          message: "Required",
        },
        {
          code: "invalid_type",
          expected: "number",
          received: "string",
          path: ["settings", "timeout"],
          message: "Expected number, received string",
        },
      ]

      const zodError = new ZodError(zodIssues)
      const exception = new AppExceptionBadRequest(zodError, "body")

      expect(exception.errors).toEqual({
        "user.profile.name": "Required",
        "settings.timeout": "Expected number, received string",
      })
    })

    it("should handle validation errors for different targets", () => {
      const zodIssues: ZodIssue[] = [
        {
          code: "invalid_type",
          expected: "string",
          received: "undefined",
          path: ["id"],
          message: "Required",
        },
      ]

      const zodError = new ZodError(zodIssues)

      const bodyException = new AppExceptionBadRequest(zodError, "body")
      const queryException = new AppExceptionBadRequest(zodError, "query")
      const paramsException = new AppExceptionBadRequest(zodError, "params")
      const headersException = new AppExceptionBadRequest(zodError, "headers")

      expect(bodyException.in).toBe("body")
      expect(queryException.in).toBe("query")
      expect(paramsException.in).toBe("params")
      expect(headersException.in).toBe("headers")
    })
  })

  describe("AppExceptionConflict", () => {
    it("should create exception with default message", () => {
      const exception = new AppExceptionConflict()

      expect(exception).toBeInstanceOf(Error)
      expect(exception.status).toBe(409)
      expect(exception.code).toBe("CONFLICT")
      expect(exception.message).toBe("Conflict")
    })

    it("should create exception with custom message", () => {
      const exception = new AppExceptionConflict("Resource already exists")

      expect(exception.message).toBe("Resource already exists")
    })

    it("should handle conflict-specific scenarios", () => {
      const exceptions = [
        new AppExceptionConflict("Email address already in use"),
        new AppExceptionConflict("Cannot delete resource with active dependencies"),
        new AppExceptionConflict("Optimistic locking failure - resource was modified"),
      ]

      expect(exceptions[0].message).toBe("Email address already in use")
      expect(exceptions[1].message).toBe("Cannot delete resource with active dependencies")
      expect(exceptions[2].message).toBe("Optimistic locking failure - resource was modified")
    })
  })

  describe("Exception Inheritance", () => {
    it("should properly extend base classes", () => {
      const exceptions = [
        new AppExceptionInternalServerError(),
        new AppExceptionNotFound("User", "id", "123"),
        new AppExceptionForbidden(),
        new AppExceptionUnauthorized(),
        new AppExceptionBadRequest(),
        new AppExceptionConflict(),
      ]

      exceptions.forEach((exception) => {
        expect(exception).toBeInstanceOf(Error)
        expect(typeof exception.status).toBe("number")
        expect(typeof exception.code).toBe("string")
        expect(typeof exception.message).toBe("string")
      })
    })

    it("should have unique status codes", () => {
      const statusCodes = [
        new AppExceptionInternalServerError().status,
        new AppExceptionNotFound("", "", "").status,
        new AppExceptionForbidden().status,
        new AppExceptionUnauthorized().status,
        new AppExceptionBadRequest().status,
        new AppExceptionConflict().status,
      ]

      const uniqueStatusCodes = new Set(statusCodes)
      expect(uniqueStatusCodes.size).toBe(statusCodes.length)
    })

    it("should have unique error codes", () => {
      const errorCodes = [
        new AppExceptionInternalServerError().code,
        new AppExceptionNotFound("", "", "").code,
        new AppExceptionForbidden().code,
        new AppExceptionUnauthorized().code,
        new AppExceptionBadRequest().code,
        new AppExceptionConflict().code,
      ]

      const uniqueErrorCodes = new Set(errorCodes)
      expect(uniqueErrorCodes.size).toBe(errorCodes.length)
    })
  })

  describe("Exception JSON Serialization", () => {
    it("should serialize basic exception properties", () => {
      const exception = new AppExceptionUnauthorized("Invalid credentials")

      const serialized = {
        status: exception.status,
        code: exception.code,
        message: exception.message,
      }

      expect(serialized).toEqual({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Invalid credentials",
      })
    })

    it("should serialize bad request with validation errors", () => {
      const zodIssues: ZodIssue[] = [
        {
          code: "invalid_type",
          expected: "string",
          received: "number",
          path: ["name"],
          message: "Expected string, received number",
        },
      ]

      const zodError = new ZodError(zodIssues)
      const exception = new AppExceptionBadRequest(zodError, "body", "Validation failed")

      const serialized = {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        in: exception.in,
        errors: exception.errors,
      }

      expect(serialized).toEqual({
        status: 400,
        code: "BAD_REQUEST",
        message: "Validation failed",
        in: "body",
        errors: {
          "name": "Expected string, received number",
        },
      })
    })

    it("should serialize forbidden exception with policy details", () => {
      const validPolicies = [{ policyFrn: "frn::policy:read", statementId: "stmt-1" }]
      const invalidRequest = [{ action: "write", resource: ["frn::resource:123"] }] as any

      const exception = new AppExceptionForbidden("Access denied", validPolicies, invalidRequest)

      const serialized = {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        validPolicies: exception.validPolicies,
        invalidRequest: exception.invalidRequest,
      }

      expect(serialized).toEqual({
        status: 403,
        code: "FORBIDDEN",
        message: "Access denied",
        validPolicies: validPolicies,
        invalidRequest: invalidRequest,
      })
    })
  })
})
