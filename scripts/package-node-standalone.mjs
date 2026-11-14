import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// Vinext 0.1.0's Node server reaches build/report.js -> vite (a peer).
// Its standalone collector follows dependencies, not peers. Add this one
// runtime root, then use the pinned collector for its transitive closure.
// Do not copy the project's node_modules or install packages at runtime.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const vinextRoot = resolve(dirname(fileURLToPath(import.meta.resolve("vinext"))), "..")
const pkg = JSON.parse(readFileSync(resolve(vinextRoot, "package.json"), "utf8"))
if (pkg.version !== "0.1.0") throw new Error("Revalidate standalone peer packaging before upgrading Vinext")
const manifestPath = resolve(root, "dist/server/vinext-externals.json")
const external = JSON.parse(readFileSync(manifestPath, "utf8"))
writeFileSync(manifestPath, JSON.stringify([...new Set([...external, "vite"])].sort(), null, 2) + "\n")
const { emitStandaloneOutput } = await import(pathToFileURL(resolve(vinextRoot, "dist/build/standalone.js")))
const result = emitStandaloneOutput({ root, outDir: resolve(root, "dist") })
console.log(`Node standalone packaged: ${result.copiedPackages.length} runtime packages (locked Vinext collector)`)
