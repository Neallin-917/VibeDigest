import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = resolve(repositoryRoot, "config/customer-plan-catalog.json")
const generatedPath = resolve(repositoryRoot, "frontend/src/generated/customer-plan-catalog.json")
const checkOnly = process.argv.includes("--check")

const source = `${JSON.stringify(JSON.parse(await readFile(sourcePath, "utf8")), null, 2)}\n`

if (checkOnly) {
  const generated = await readFile(generatedPath, "utf8").catch(() => "")
  if (generated !== source) {
    console.error("Customer plan catalog mirror is stale. Run: npm run catalog:sync")
    process.exitCode = 1
  }
} else {
  await writeFile(generatedPath, source)
}
