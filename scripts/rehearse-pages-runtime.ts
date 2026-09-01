import { createServer, request as httpRequest } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { loadReleaseManifest, verifyReleaseEndpoint } from "./release-verification.ts";
import { ARTIFACT_MANIFEST_NAME } from "../market-data/artifact-tree.ts";
import { hashCandidate } from "../market-data/review.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidateDirectory = join(projectRoot, "work", "pages-candidate");
const manifestPath = join(candidateDirectory, ARTIFACT_MANIFEST_NAME);

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not reserve a local port");
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return address.port;
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function isMissingProcess(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ESRCH"
  );
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) return true;
  return new Promise((resolvePromise) => {
    const onExit = () => {
      clearTimeout(timeout);
      resolvePromise(true);
    };
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolvePromise(hasExited(child));
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

function signalRuntime(
  child: ChildProcess,
  signal: NodeJS.Signals,
  killProcessGroup: boolean,
): void {
  if (hasExited(child)) return;
  if (
    killProcessGroup &&
    process.platform !== "win32" &&
    typeof child.pid === "number"
  ) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (!isMissingProcess(error)) throw error;
      return;
    }
  }
  try {
    child.kill(signal);
  } catch (error) {
    if (!isMissingProcess(error)) throw error;
  }
}

export async function stopSpawnedRuntime(
  child: ChildProcess,
  graceMs = 3_000,
  forceMs = 2_000,
  killProcessGroup = false,
): Promise<void> {
  if (hasExited(child)) return;
  signalRuntime(child, "SIGTERM", killProcessGroup);
  if (await waitForExit(child, graceMs)) return;
  signalRuntime(child, "SIGKILL", killProcessGroup);
  if (!(await waitForExit(child, forceMs))) {
    throw new Error("Wrangler Pages local runtime did not exit after forced termination");
  }
}

export async function requestLocalOriginWithHost(
  input: string,
  hostHeader: string,
  timeoutMs = 15_000,
): Promise<Response> {
  const url = new URL(input);
  return await new Promise<Response>((resolvePromise, reject) => {
    const request = httpRequest(
      url,
      {
        headers: { host: hostHeader },
        method: "GET",
        signal: AbortSignal.timeout(timeoutMs),
      },
      (response) => {
        response.resume();
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }
        resolvePromise(new Response(null, {
          headers,
          status: response.statusCode ?? 500,
        }));
      },
    );
    request.once("error", reject);
    request.end();
  });
}

async function main(): Promise<void> {
  const expectedManifestSha256 = hashCandidate(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  const manifest = await loadReleaseManifest(manifestPath, expectedManifestSha256);
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
    detached: process.platform !== "win32",
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
    const redirect = await requestLocalOriginWithHost(`${origin}/`, "www.aimarketatlas.net");
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
    await stopSpawnedRuntime(child, 3_000, 2_000, process.platform !== "win32");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
