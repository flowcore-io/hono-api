import { z } from "zod"
import process from "node:process"

export enum NodeEnv {
  Development = "development",
  Production = "production",
  Staging = "staging",
  Test = "test",
}

export class Environment<T extends z.ZodObject<z.ZodRawShape>> {
  private schema: T
  private _env: z.infer<typeof this.schema> | undefined

  constructor(schema: T) {
    this.schema = schema
  }

  get env(): z.infer<T> {
    if (this._env) {
      return this._env
    }

    if (process.env.SKIP_ENV_VALIDATION) {
      console.debug("Skipping env validation")
      this._env = {} as z.infer<typeof this.schema>
      return this._env
    }

    const parsed = this.schema.safeParse(process.env)

    if (!parsed.success) {
      console.error("Missing or invalid environment variables", { errors: parsed.error })
      process.exit(1)
    }

    this._env = parsed.data
    return this._env as z.infer<T>
  }
}

export const zBooleanString = z.string().transform((value) => {
  if (value === "true") {
    return true
  } else if (value === "false") {
    return false
  } else {
    throw new Error(`The string must be 'true' or 'false', got ${value}`)
  }
})
