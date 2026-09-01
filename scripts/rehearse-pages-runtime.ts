import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { loadReleaseManifest, verifyReleaseEndpoint } from "./release-verification.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidateDirectory = join(projectRoot, "work", "pages-candidate");

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not reserve a local port");
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return address.port;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolvePromise) => child.once("exit", () => resolvePromise()));
}

async function main(): Promise<void> {
  const manifest = await loadReleaseManifest();
  const port = await reservePort();
  const child = spawn("npx", [
    "wrangler",
    "pages",
    "dev",
    candidateDirectory,
    "--local",
    "--port",
    String(port),
    "--show-interactive-dev-session=false",
  ], {
    cwd: projectRoot,
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr?.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Wrangler Pages local runtime exited before readiness.\n${output}`);
      }
      try {
        const response = await fetch(origin, { redirect: "manual" });
        if (response.status > 0) break;
      } catch {
        // Keep polling until the Wrangler server is ready or the bounded deadline expires.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    if (Date.now() >= deadline) throw new Error(`Wrangler Pages local runtime did not become ready within 30 seconds.\n${output}`);
    const redirect = await fetch(`${origin}/`, {
      headers: { host: "www.aimarketatlas.net" },
      redirect: "manual",
    });
    if (redirect.status !== 301 || redirect.headers.get("location") !== "https://aimarketatlas.net/") {
      throw new Error(`Pages worker redirect contract failed: HTTP ${redirect.status} ${redirect.headers.get("location") ?? ""}`);
    }
    await verifyReleaseEndpoint(origin, manifest, process.env.NEWSLETTER_ENDPOINT ? "enabled" : "disabled");
    process.stdout.write(`Pages/Wrangler local runtime rehearsal passed on ${origin}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/modules-watch|middleware-insertion-facade|worker runtime failed to start/i.test(`${message}\n${output}`)) {
      throw new Error(`${message}\nPrerequisites: install the repository-pinned Wrangler and workerd binaries with npm ci; use a Wrangler release whose Pages local runtime resolves injected wrangler:modules-watch modules; run from this repository with work/pages-candidate and dist/server/wrangler.json present. This gate is fail-closed until the actual Pages runtime starts.`);
    }
    throw error;
  } finally {
    await stop(child);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
