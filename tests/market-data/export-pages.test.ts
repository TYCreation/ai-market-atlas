import assert from "node:assert/strict";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { exportPages } from "../../scripts/export-pages.ts";

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const outputDirectory = join(projectRoot, "work", "pages-candidate");
const snapshotPath = join(projectRoot, "data", "market", "current.json");

test("exports every current/archive route and public asset without localhost metadata", async () => {
  await rm(outputDirectory, { recursive: true, force: true });
  try {
    const result = await exportPages({
      projectRoot,
      snapshotPath,
      outputDirectory,
      build: false,
    });

    assert.deepEqual(result.routes, [
      "/",
      "/stocks",
      "/compute",
      "/energy",
      "/models",
      "/sic",
      "/archive",
      "/archive/2026-07",
      "/market-brief/",
    ]);
    for (const path of [
      "index.html",
      "stocks/index.html",
      "compute/index.html",
      "energy/index.html",
      "models/index.html",
      "sic/index.html",
      "archive/index.html",
      "archive/2026-07/index.html",
      "market-brief/index.html",
      "market-brief/data.json",
      ".market-deployment.json",
      "favicon.svg",
      "og.png",
    ]) {
      assert.equal((await lstat(join(outputDirectory, path))).isFile(), true, path);
    }
    assert.ok((await readdir(join(outputDirectory, "assets"))).length > 0);

    const routeFiles = result.routes
      .filter((route) => route !== "/market-brief/")
      .map((route) =>
        route === "/"
          ? join(outputDirectory, "index.html")
          : join(outputDirectory, route.slice(1), "index.html"),
      );
    const html = (
      await Promise.all(routeFiles.map((path) => readFile(path, "utf8")))
    ).join("\n");
    assert.match(html, /https:\/\/aimarket\.tycreation\.online/);
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1/i);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          join(outputDirectory, ".market-deployment.json"),
          "utf8",
        ),
      ),
      {
        routes: result.routes,
        runId: result.runId,
        dataCutoff: result.dataCutoff,
        archiveMonths: result.archiveMonths,
        sourceIds: result.sourceIds,
        archiveSourceIds: result.archiveSourceIds,
      },
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("rejects unsafe export paths before build or output mutation", async () => {
  const unsafe = join(projectRoot, "work", "..", "pages-candidate");
  await assert.rejects(
    () =>
      exportPages({
        projectRoot,
        snapshotPath,
        outputDirectory: unsafe,
        build: false,
      }),
    /unsafe|output directory/i,
  );
  await assert.rejects(
    () =>
      exportPages({
        projectRoot,
        snapshotPath: join(projectRoot, "data", "market", "..", "current.json"),
        outputDirectory,
        build: false,
      }),
    /snapshot path is unsafe/i,
  );
});
