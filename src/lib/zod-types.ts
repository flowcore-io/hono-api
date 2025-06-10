import { z } from "zod"

export const zBooleanString: z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodString]>, boolean, string | boolean> = z.union(
  [z.boolean(), z.string()],
).transform((value, ctx) => {
  if (typeof value === "boolean") {
    return value
  }
  if (value.toLowerCase() === "true" || value === "1") {
    return true
  }
  if (value.toLowerCase() === "false" || value === "0") {
    return false
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `Must be a boolean or a string that is 'true', 'false', '1', or '0', got ${value}`,
  })
  return z.NEVER
})

export const zFlowcoreName: z.ZodEffects<z.ZodString, string, string> = z.string()
  .transform((value, ctx) => {
    let hasErrors = false
    if (value.startsWith("-") || value.endsWith("-") || value.startsWith(".") || value.endsWith(".")) {
      hasErrors = true
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Must not start or end with a hyphen or period`,
      })
    }
    if (/^\d/.test(value)) {
      hasErrors = true
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Must not start with a number`,
      })
    }
    if (!/^[a-z0-9.-]+$/.test(value)) {
      hasErrors = true
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Must only contain lowercase letters, numbers, periods, and hyphens`,
      })
    }
    if (value.includes("--") || value.includes("..") || value.includes("-.") || value.includes(".-")) {
      hasErrors = true
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Hyphens and periods must be preceded and succeeded by a character or number`,
      })
    }
    if (hasErrors) {
      return z.NEVER
    }
    return value
  })
