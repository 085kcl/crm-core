import { execFileSync } from "node:child_process"

const container = process.argv[2] || "crm-core-ci"
const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  const state = JSON.parse(execFileSync("docker", ["inspect", "--format", "{{json .State}}", container], { encoding: "utf8" }))
  if (!state.Running || state.Health?.Status === "unhealthy") throw new Error("Container stopped or unhealthy")
  if (state.Health?.Status === "healthy") {
    console.log(JSON.stringify({ container, health: "healthy" }))
    process.exit(0)
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))
}
throw new Error("Container never reached HEALTHY within 90 seconds")
