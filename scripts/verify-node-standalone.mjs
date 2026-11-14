import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"

// Relocation prevents Node from resolving missing packages in the build tree.
const isolated = await mkdtemp(join(tmpdir(), "crm-standalone-"))
const smoke = resolve("deploy/hostinger/smoke.mjs")
let server
try {
  await cp(resolve("dist/standalone"), isolated, { recursive: true })
  server = spawn(process.execPath, [join(isolated, "server.js")], {
    cwd: isolated,
    env: { PATH: process.env.PATH, NODE_ENV: "production", HOST: "127.0.0.1", PORT: "3199" },
    stdio: "inherit",
  })
  server.on("error", (error) => console.error(error))
  const smokeProcess = spawn(process.execPath, [smoke, "http://127.0.0.1:3199"], { stdio: "inherit" })
  const [code] = await once(smokeProcess, "exit")
  if (code !== 0) throw new Error(`Isolated standalone smoke failed: ${code}`)
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit")
    server.kill("SIGTERM")
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000)
    await exited
    clearTimeout(timer)
  }
  await rm(isolated, { recursive: true, force: true })
}
