import assert from "node:assert/strict";
import test from "node:test";
import { getMonthlyArchive, listMonthlyArchives } from "../../market-data/monthly.ts";

test("returns a permanent YYYY-MM archive", () => {
  const archive = getMonthlyArchive("2026-07");

  assert.ok(archive);
  assert.equal(archive.month, "2026-07");
  assert.ok(archive.sourceIds.length > 0);
});

test("rejects an invalid archive month path before lookup", () => {
  assert.throws(() => getMonthlyArchive("../2026-07"), /Invalid archive month/);
});

test("lists the permanent archive month for static route generation", () => {
  assert.deepEqual(listMonthlyArchives().map(({ month }) => month), ["2026-07"]);
});
