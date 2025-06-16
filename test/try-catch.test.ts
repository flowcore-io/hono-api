import { expect } from "jsr:@std/expect"
import { describe, it } from "jsr:@std/testing/bdd"
import { tryCatch } from "../src/lib/try-catch.ts"

describe("try-catch", () => {
  it("should catch errors in async functions", async () => {
    const result = await tryCatch((async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      throw new Error("test")
    })())
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe("test")
    expect(result.data).toBeNull()
  })

  it("should catch errors in sync functions", async () => {
    const result = await tryCatch(() => JSON.parse("}"))
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe("Unexpected token '}', \"}\" is not valid JSON")
    expect(result.data).toBeNull()
  })

  it("should return data", async () => {
    const result = await tryCatch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return "test"
    })
    expect(result.data).toBe("test")
    expect(result.error).toBeNull()
  })

  it("should return data from sync functions", async () => {
    const result = await tryCatch(() => JSON.parse(`{"test": "test"}`))
    expect(result.data).toEqual({ test: "test" })
    expect(result.error).toBeNull()
  })
})
