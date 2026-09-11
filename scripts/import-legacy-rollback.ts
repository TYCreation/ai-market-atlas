/** One-time, read-verified migration of the exact preserved August production artifact.
 * Does not build, upload, promote, or overwrite an existing anchor.
 */
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hashCandidate } from "../market-data/review.ts";
import { AUGUST_PRODUCTION_ANCHOR, verifyLegacyRollback } from "../market-data/legacy-rollback.ts";
import { LAST_GOOD_ANCHOR_NAME, validateLastGoodDirectory, withPublicationLock, writeLastGoodAnchorAtomically } from "./deploy-pages.ts";

if (process.argv.length !== 2) throw new Error("import-legacy-rollback takes no arguments");
const root = resolve(import.meta.dirname, "..");
await withPublicationLock(root, AUGUST_PRODUCTION_ANCHOR.runId, async () => {
  const current = JSON.parse(await readFile(join(root, "data/market/current.json"), "utf8"));
  if (hashCandidate(current) !== AUGUST_PRODUCTION_ANCHOR.candidateSha256) throw new Error("Current does not match the pinned legacy production snapshot");
  try {
    await lstat(join(root, "work", LAST_GOOD_ANCHOR_NAME));
    throw new Error("Existing rollback anchor must not be overwritten");
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
  }
  const directory = join(root, "work/pages-last-good");
  await validateLastGoodDirectory(directory, AUGUST_PRODUCTION_ANCHOR);
  await verifyLegacyRollback("https://aimarketatlas.net", directory);
  await validateLastGoodDirectory(directory, AUGUST_PRODUCTION_ANCHOR);
  await writeLastGoodAnchorAtomically(root, AUGUST_PRODUCTION_ANCHOR);
  console.log(JSON.stringify({ imported: true, productionBytesVerified: true, ...AUGUST_PRODUCTION_ANCHOR }));
});
