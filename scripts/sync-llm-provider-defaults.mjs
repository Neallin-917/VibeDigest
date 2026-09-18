import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = resolve(repositoryRoot, "config/llm-provider-defaults.json")
const generatedPath = resolve(repositoryRoot, "frontend/src/generated/llm-provider-defaults.json")
const source = `${JSON.stringify(JSON.parse(await readFile(sourcePath, "utf8")), null, 2)}\n`

if (process.argv.includes("--check")) {
  const generated = await readFile(generatedPath, "utf8").catch(() => "")
  if (generated !== source) {
    console.error("Model defaults mirror is stale. Run: npm run models:sync")
    process.exitCode = 1
  }
} else {
  await writeFile(generatedPath, source)
}
