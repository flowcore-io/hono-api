// ex. scripts/build_npm.ts
import { build, emptyDir } from "jsr:@deno/dnt"
import denoJson from "../deno.json" with { type: "json" }
await emptyDir("./npm")

await build({
  entryPoints: ["./src/mod.ts"],
  test: false,
  outDir: "./npm",
  importMap: "./deno.json",
  shims: {
    // see JS docs for overview and more options
    deno: true,
    webSocket: true,
  },
  package: {
    name: denoJson.name,
    description: denoJson.description,
    version: denoJson.version,
    license: denoJson.license,
    homepage: "https://github.com/flowcore-io/hono-api#readme",
    repository: {
      type: "git",
      url: "git+https://github.com/flowcore-io/hono-api.git",
    },
    bugs: {
      url: "https://github.com/flowcore-io/hono-api/issues",
    },
    dependencies: {
      "zod": undefined as unknown as string,
      "@flowcore/pathways": undefined as unknown as string,
    },
    peerDependencies: {
      "zod": "^3.25.63",
      "@flowcore/pathways": "^0.16.2",
    },
  },
  compilerOptions: {
    lib: ["ES2023", "DOM"],
  },
  postBuild() {
    // steps to run after building and before running the tests
    // Deno.copyFileSync("LICENSE", "npm/LICENSE")
    Deno.copyFileSync("README.md", "npm/README.md")
    Deno.copyFileSync("CHANGELOG.md", "npm/CHANGELOG.md")
  },
})
