import { expect } from "jsr:@std/expect"
import { describe, it } from "jsr:@std/testing/bdd"
import { zFlowcoreName } from "../src/lib/zod-types.ts"
import { zBooleanString } from "@flowcore/hono-api"
import { z } from "zod"

describe("zod-types", () => {
  it("should fail to validate flowcore name", () => {
    const result = z.object({
      name: zFlowcoreName,
    }).safeParse({ name: "1Test-testing.-011-" })
    expect(result.success).toBe(false)
    expect(result.error?.errors).toHaveLength(4)
    expect(result.error?.errors[0].message).toContain("Must not start or end with a hyphen or period")
    expect(result.error?.errors[1].message).toContain("Must not start with a number")
    expect(result.error?.errors[2].message).toContain(
      "Must only contain lowercase letters, numbers, periods, and hyphens",
    )
    expect(result.error?.errors[3].message).toContain(
      "Hyphens and periods must be preceded and succeeded by a character or number",
    )
  })

  it("should validate flowcore name", () => {
    const result = z.object({
      name: zFlowcoreName,
    }).safeParse({ name: "test-testing.011" })
    expect(result.success).toBe(true)
  })

  it("should fail to validate boolean string", () => {
    const result = z.object({
      name: zBooleanString,
    }).safeParse({ name: "ttrue" })
    expect(result.success).toBe(false)
    expect(result.error?.errors).toHaveLength(1)
  })

  it("should validate boolean string", () => {
    const schema = z.object({
      val: zBooleanString,
    })

    let result = schema.safeParse({ val: true })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(true)

    result = schema.safeParse({ val: "true" })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(true)

    result = schema.safeParse({ val: "True" })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(true)

    result = schema.safeParse({ val: "TRUE" })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(true)

    result = schema.safeParse({ val: "1" })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(true)

    result = schema.safeParse({ val: false })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(false)

    result = schema.safeParse({ val: "false" })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(false)

    result = schema.safeParse({ val: "False" })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(false)

    result = schema.safeParse({ val: "FALSE" })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(false)

    result = schema.safeParse({ val: "0" })
    expect(result.success).toBe(true)
    expect(result.data?.val).toBe(false)
  })
})
