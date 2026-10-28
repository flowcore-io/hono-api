import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const cwd = fileURLToPath(new URL("../npm/", import.meta.url))

// Resolve the actual generated package through its public exports. Each module
// format runs in a fresh process so an earlier import cannot hide side effects.
for (const format of ["module", "commonjs"]) {
  const load = format === "module" ? "const load = (name) => import(name)" : "const load = (name) => require(name)"
  const source = `
    ${load}
    const assert = (await load("node:assert/strict")).default ?? await load("node:assert/strict")
    const schemas = await Promise.all([load("zod"), load("zod4-test")])
    const snapshots = schemas.map(({ z }) => ({
      z,
      pick: z.ZodObject.prototype.pick,
      omit: z.ZodObject.prototype.omit,
      optional: z.ZodType.prototype.optional,
    }))
    const { loggerFactory, LogLevel } = await load("@flowcore/hono-api/logger")
    assert.equal(typeof loggerFactory, "function")
    assert.equal(LogLevel.Info, "info")
    for (const { z, pick, omit, optional } of snapshots) {
      assert.equal(z.ZodObject.prototype.pick, pick)
      assert.equal(z.ZodObject.prototype.omit, omit)
      assert.equal(z.ZodType.prototype.optional, optional)
      const schema = z.object({ name: z.string(), count: z.number() })
      assert.deepEqual(schema.pick({ name: true }).parse({ name: "ok" }), { name: "ok" })
      assert.deepEqual(schema.omit({ count: true }).parse({ name: "ok" }), { name: "ok" })
      assert.equal(schema.optional().parse(undefined), undefined)
      assert.equal(schema.pick({ name: true }).safeParse({ name: 42 }).success, false)
    }
    loggerFactory({ prettyPrintLogs: false, logLevel: LogLevel.Info })
      .createLogger("logger-export-smoke").info("Logger export OK")
  `
  // CommonJS has no top-level await; the same checks still run asynchronously.
  const script = format === "module" ? source : `(async () => { ${source} })().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })`
  const result = spawnSync(process.execPath, ["--input-type=" + format, "--eval", script], {
    cwd,
    encoding: "utf8",
    timeout: 15_000,
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, "")
  const records = result.stdout.trim().split("\n").map((line) => JSON.parse(line))
  assert.equal(records.length, 1)
  assert.equal(records[0].level, "info")
  assert.equal(records[0].label, "logger-export-smoke")
  assert.equal(records[0].message, "Logger export OK")
  console.log(`${format}: public logger export and Zod 3/4 behavior passed`)
}
