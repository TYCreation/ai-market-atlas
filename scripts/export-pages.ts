import { randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { parseMonthlyArchiveIndex } from "../market-data/monthly.ts";
import { assertMarketSnapshot } from "../market-data/schema.ts";

type WorkerModule = {
  default: {
    fetch(
      request: Request,
      env: Record<string, unknown>,
      context: {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException(): void;
      },
    ): Promise<Response>;
  };
};

export type ExportPagesOptions = {
  projectRoot?: string;
  snapshotPath?: string;
  outputDirectory?: string;
  build?: boolean;
};

export type ExportPagesResult = {
  outputDirectory: string;
  routes: string[];
  runId: string;
  dataCutoff: string;
  archiveMonths: string[];
  sourceIds: string[];
  archiveSourceIds: Record<string, string[]>;
};

export type DeploymentManifest = Omit<ExportPagesResult, "outputDirectory">;

const CURRENT_ROUTES = [
  "/",
  "/stocks",
  "/compute",
  "/energy",
  "/models",
  "/sic",
] as const;

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: "inherit",
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, 10 * 60 * 1_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${command} timed out after ten minutes`));
        return;
      }
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new Error(
          `${command} exited with ${code ?? `signal ${signal ?? "unknown"}`}`,
        ),
      );
    });
  });
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
}

async function assertDirectoryTreeSafe(path: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`export source directory is unsafe: ${path}`);
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`export source contains a symlink: ${child}`);
    }
    if (entry.isDirectory()) await assertDirectoryTreeSafe(child);
  }
}

async function assertOutputPathSafe(
  projectRoot: string,
  outputDirectory: string,
): Promise<void> {
  const workDirectory = resolve(projectRoot, "work");
  if (
    dirname(outputDirectory) !== workDirectory ||
    !["pages-candidate", "pages-last-good"].includes(basename(outputDirectory))
  ) {
    throw new Error("export output directory is unsafe");
  }
  try {
    const workMetadata = await lstat(workDirectory);
    if (workMetadata.isSymbolicLink() || !workMetadata.isDirectory()) {
      throw new Error("export work directory is unsafe");
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  try {
    const metadata = await lstat(outputDirectory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("export output directory is unsafe");
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

function contentType(path: string): string {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".jpg": "image/jpeg",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    }[extname(path)] ?? "application/octet-stream"
  );
}

function routeFile(directory: string, route: string): string {
  return route === "/"
    ? join(directory, "index.html")
    : join(directory, route.slice(1), "index.html");
}

async function replaceDirectoryAtomically(
  temporary: string,
  destination: string,
): Promise<void> {
  const backup = join(
    dirname(destination),
    `.${basename(destination)}.${process.pid}.${randomUUID()}.backup`,
  );
  let movedExisting = false;
  try {
    await rename(destination, backup);
    movedExisting = true;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  try {
    await rename(temporary, destination);
    if (movedExisting) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedExisting) await rename(backup, destination);
    throw error;
  }
}

async function listHtmlFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listHtmlFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

export async function exportPages(
  options: ExportPagesOptions = {},
): Promise<ExportPagesResult> {
  const projectRoot = resolve(
    options.projectRoot ??
      fileURLToPath(new URL("../", import.meta.url)),
  );
  const snapshotPath = resolve(
    projectRoot,
    options.snapshotPath ?? "data/market/current.json",
  );
  const outputDirectory = resolve(
    projectRoot,
    options.outputDirectory ?? "work/pages-candidate",
  );
  if (
    dirname(snapshotPath) !== resolve(projectRoot, "data/market") ||
    !["candidate.json", "current.json"].includes(basename(snapshotPath))
  ) {
    throw new Error("market snapshot path is unsafe");
  }
  await assertOutputPathSafe(projectRoot, outputDirectory);
  await assertRegularFile(snapshotPath, "market snapshot");
  const snapshot: unknown = JSON.parse(await readFile(snapshotPath, "utf8"));
  assertMarketSnapshot(snapshot);

  if (options.build !== false) {
    await runCommand("npm", ["run", "build"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        MARKET_SNAPSHOT_PATH: snapshotPath,
        WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
      },
    });
  }

  const clientDirectory = resolve(projectRoot, "dist/client");
  const serverPath = resolve(projectRoot, "dist/server/index.js");
  const monthlyIndexPath = resolve(
    projectRoot,
    "data/market/monthly/index.json",
  );
  await Promise.all([
    assertDirectoryTreeSafe(clientDirectory),
    assertRegularFile(serverPath, "built Vinext server"),
    assertRegularFile(monthlyIndexPath, "monthly archive index"),
  ]);
  const monthlyIndex: unknown = JSON.parse(
    await readFile(monthlyIndexPath, "utf8"),
  );
  const monthlyArchives = parseMonthlyArchiveIndex(monthlyIndex);
  const archiveMonths = monthlyArchives.map(
    ({ archive }) => archive.month,
  );
  const sourceIds = Object.keys(snapshot.sources).sort();
  const archiveSourceIds = Object.fromEntries(
    monthlyArchives.map(({ archive }) => [
      archive.month,
      [...archive.sourceIds].sort(),
    ]),
  );
  const renderedRoutes = [
    ...CURRENT_ROUTES,
    "/archive",
    ...archiveMonths.map((month) => `/archive/${month}`),
  ];
  const routes = [...renderedRoutes, "/market-brief/"];

  const workDirectory = dirname(outputDirectory);
  await mkdir(workDirectory, { recursive: true });
  const temporary = join(
    workDirectory,
    `.${basename(outputDirectory)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await cp(clientDirectory, temporary, {
      recursive: true,
      dereference: false,
      force: false,
      errorOnExist: true,
    });
    const workerUrl = pathToFileURL(serverPath);
    workerUrl.searchParams.set("export", randomUUID());
    const worker = (await import(workerUrl.href)) as WorkerModule;
    const assets = {
      fetch: async (request: Request) => {
        const pathname = decodeURIComponent(new URL(request.url).pathname);
        const path = resolve(clientDirectory, `.${pathname}`);
        const assetRelativePath = relative(clientDirectory, path);
        if (
          assetRelativePath.startsWith("..") ||
          assetRelativePath.includes("\\..\\") ||
          resolve(clientDirectory, assetRelativePath) !== path
        ) {
          return new Response("Not found", { status: 404 });
        }
        try {
          const metadata = await stat(path);
          if (!metadata.isFile()) return new Response("Not found", { status: 404 });
          return new Response(await readFile(path), {
            status: 200,
            headers: { "content-type": contentType(path) },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    };
    for (const route of renderedRoutes) {
      const response = await worker.default.fetch(
        new Request(`https://aimarket.tycreation.online${route}`, {
          headers: {
            accept: "text/html",
            "x-forwarded-host": "aimarket.tycreation.online",
            "x-forwarded-proto": "https",
          },
        }),
        { ASSETS: assets },
        {
          waitUntil() {},
          passThroughOnException() {},
        },
      );
      if (response.status !== 200) {
        throw new Error(`Vinext export returned HTTP ${response.status} for ${route}`);
      }
      const html = await response.text();
      if (/localhost|127\.0\.0\.1/i.test(html)) {
        throw new Error(`Vinext export contains localhost metadata for ${route}`);
      }
      const destination = routeFile(temporary, route);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, html, { flag: "wx" });
    }
    for (const htmlPath of await listHtmlFiles(temporary)) {
      if (/localhost|127\.0\.0\.1/i.test(await readFile(htmlPath, "utf8"))) {
        throw new Error(`export contains localhost metadata: ${htmlPath}`);
      }
    }
    const manifest: DeploymentManifest = {
      routes,
      runId: snapshot.runId,
      dataCutoff: snapshot.dataCutoff,
      archiveMonths,
      sourceIds,
      archiveSourceIds,
    };
    await writeFile(
      join(temporary, ".market-deployment.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx" },
    );
    await replaceDirectoryAtomically(temporary, outputDirectory);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }

  return {
    outputDirectory,
    routes,
    runId: snapshot.runId,
    dataCutoff: snapshot.dataCutoff,
    archiveMonths,
    sourceIds,
    archiveSourceIds,
  };
}

function option(args: string[], name: string): string | undefined {
  const matches = args
    .map((argument, index) => ({ argument, index }))
    .filter(({ argument }) => argument === name);
  if (matches.length > 1) throw new Error(`duplicate ${name} option`);
  if (matches.length === 0) return undefined;
  const value = args[matches[0].index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a path`);
  return value;
}

async function main(args: string[]): Promise<void> {
  const allowed = new Set(["--snapshot", "--output", "--no-build"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!allowed.has(argument)) throw new Error(`unknown option: ${argument}`);
    if (argument !== "--no-build") index += 1;
  }
  const result = await exportPages({
    snapshotPath: option(args, "--snapshot"),
    outputDirectory: option(args, "--output"),
    build: !args.includes("--no-build"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
