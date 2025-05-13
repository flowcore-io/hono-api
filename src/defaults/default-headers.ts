import { z } from "@hono/zod-openapi"

export const defaultHeaders = z
  .object({
    authorization: z.string().optional().openapi({ example: "ApiKey 1234567890" }),
  })
  .openapi("DefaultHeaders")
