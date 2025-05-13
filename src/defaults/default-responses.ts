import { z } from "@hono/zod-openapi"

export const defaultResponses = {
  400: {
    description: "Bad Request",
    content: {
      "application/json": {
        schema: z
          .object({
            status: z.literal(400).openapi({ example: 400 }),
            code: z.literal("BAD_REQUEST").openapi({ example: "BAD_REQUEST" }),
            message: z.string().openapi({ example: "Bad Request" }),
            in: z.string().openapi({ example: "query" }).optional(),
            errors: z
              .record(z.string(), z.string())
              .openapi({ example: { name: "Invalid name" } })
              .optional(),
          })
          .openapi("Response 400"),
      },
    },
  },
  401: {
    description: "Unauthorized",
    content: {
      "application/json": {
        schema: z
          .object({
            status: z.literal(401).openapi({ example: 401 }),
            code: z.literal("UNAUTHORIZED").openapi({ example: "UNAUTHORIZED" }),
            message: z.string().openapi({ example: "Unauthorized" }),
          })
          .openapi("Response 401"),
      },
    },
  },
  403: {
    description: "Forbidden",
    content: {
      "application/json": {
        schema: z
          .object({
            status: z.literal(403).openapi({ example: 403 }),
            code: z.literal("FORBIDDEN").openapi({ example: "FORBIDDEN" }),
            message: z.string().openapi({ example: "Forbidden" }),
          })
          .openapi("Response 403"),
      },
    },
  },
  404: {
    description: "Not Found",
    content: {
      "application/json": {
        schema: z
          .object({
            status: z.literal(404).openapi({ example: 404 }),
            code: z.literal("NOT_FOUND").openapi({ example: "NOT_FOUND" }),
            message: z.string().openapi({ example: "Not Found" }),
          })
          .openapi("Response 404"),
      },
    },
  },
  500: {
    description: "Internal Server Error",
    content: {
      "application/json": {
        schema: z
          .object({
            status: z.literal(500).openapi({ example: 500 }),
            code: z.literal("INTERNAL_SERVER_ERROR").openapi({ example: "INTERNAL_SERVER_ERROR" }),
            message: z.string().openapi({ example: "Internal Server Error" }),
          })
          .openapi("Response 500"),
      },
    },
  },
}
