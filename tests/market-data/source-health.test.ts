import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import {
  checkSourceHealth,
  createPinnedSourceFetcher,
  type NodeRequester,
} from "../../market-data/source-health.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const valid = candidate as unknown as MarketSnapshot;
const publicResolver = async () => ["93.184.216.34"];

test("blocks an unreachable sole URL source for a required metric", async () => {
  const targetUrl = valid.sources["stanford-economy"].url;
  const issues = await checkSourceHealth(valid, async (input) =>
    new Response("", { status: String(input) === targetUrl ? 503 : 200 }),
    publicResolver,
  );

  assert.ok(issues.some(
    (issue) =>
      issue.code === "SOURCE_UNREACHABLE" &&
      issue.metricId === "pulse.infrastructure_spend" &&
      issue.severity === "block",
  ));
});

test("checks each exact cited URL once and follows redirects with a timeout signal", async () => {
  const counts = new Map<string, number>();
  const issues = await checkSourceHealth(valid, async (input, init) => {
    const url = String(input);
    counts.set(url, (counts.get(url) ?? 0) + 1);
    assert.equal(init?.redirect, "manual");
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response("", { status: 200 });
  }, publicResolver);

  assert.deepEqual(issues, []);
  assert.ok(counts.size > 1);
  assert.ok([...counts.values()].every((count) => count === 1));
});

test("warns on a forbidden source when another trusted source is reachable", async () => {
  const forbiddenUrl = valid.sources["iea-energy-ai"].url;
  const issues = await checkSourceHealth(valid, async (input) =>
    new Response("", { status: String(input) === forbiddenUrl ? 403 : 200 }),
    publicResolver,
  );

  assert.ok(issues.some(
    (issue) =>
      issue.code === "SOURCE_UNREACHABLE" &&
      issue.metricId === "pulse.power_queue" &&
      issue.severity === "warn",
  ));
});

test("blocks forbidden access without a reachable backup and accepts redirects", async () => {
  const blockedUrl = valid.sources["stanford-economy"].url;
  const issues = await checkSourceHealth(valid, async (input) =>
    new Response("", { status: String(input) === blockedUrl ? 405 : 302 }),
    publicResolver,
  );

  assert.ok(issues.some(
    (issue) =>
      issue.code === "SOURCE_UNREACHABLE" &&
      issue.metricId === "pulse.infrastructure_spend" &&
      issue.severity === "block",
  ));
  assert.equal(issues.some((issue) => issue.sourceIds.includes("iea-energy-ai")), false);
});

test("blocks loopback, local, private, and mixed-resolution source targets before fetch", async () => {
  const cases = [
    { url: "http://127.0.0.1/report", answers: ["127.0.0.1"] },
    { url: "http://10.0.0.1/report", answers: ["10.0.0.1"] },
    { url: "http://[::1]/report", answers: ["::1"] },
    { url: "http://[fd00::1]/report", answers: ["fd00::1"] },
    { url: "http://[fe80::1]/report", answers: ["fe80::1"] },
    { url: "http://localhost/report", answers: ["127.0.0.1"] },
    { url: "https://private.attacker.com/report", answers: ["10.0.0.5"] },
    { url: "https://mixed.attacker.com/report", answers: ["93.184.216.34", "192.168.1.5"] },
  ];

  for (const entry of cases) {
    const snapshot = structuredClone(valid);
    snapshot.sources["stanford-economy"].url = entry.url;
    const requested: string[] = [];
    const issues = await checkSourceHealth(
      snapshot,
      async (input) => {
        requested.push(String(input));
        return new Response("", { status: 200 });
      },
      async (hostname) =>
        hostname === new URL(entry.url).hostname.replaceAll(/^\[|\]$/g, "")
          ? entry.answers
          : publicResolver(),
    );

    assert.ok(issues.some(
      (issue) =>
        issue.code === "SOURCE_UNREACHABLE" &&
        issue.sourceIds.includes("stanford-economy") &&
        issue.severity === "block",
    ));
    assert.equal(requested.includes(entry.url), false);
  }
});

test("blocks redirects to private targets before following them", async () => {
  const snapshot = structuredClone(valid);
  const initial = "https://safe-origin.example.net/report";
  const privateTarget = "http://169.254.169.254/latest/meta-data";
  snapshot.sources["stanford-economy"].url = initial;
  const requested: string[] = [];

  const issues = await checkSourceHealth(
    snapshot,
    async (input) => {
      const url = String(input);
      requested.push(url);
      return url === initial
        ? new Response("", { status: 302, headers: { location: privateTarget } })
        : new Response("", { status: 200 });
    },
    publicResolver,
  );

  assert.ok(issues.some(
    (issue) => issue.sourceIds.includes("stanford-economy") && issue.severity === "block",
  ));
  assert.equal(requested.includes(privateTarget), false);
});

test("follows a bounded safe public redirect manually", async () => {
  const snapshot = structuredClone(valid);
  const initial = "https://safe-origin.example.net/report";
  const redirected = "https://safe-target.example.net/report";
  snapshot.sources["stanford-economy"].url = initial;
  const requested: string[] = [];

  const issues = await checkSourceHealth(
    snapshot,
    async (input, init) => {
      const url = String(input);
      requested.push(url);
      assert.equal(init?.redirect, "manual");
      return url === initial
        ? new Response("", { status: 302, headers: { location: redirected } })
        : new Response("", { status: 200 });
    },
    publicResolver,
  );

  assert.equal(issues.some((issue) => issue.sourceIds.includes("stanford-economy")), false);
  assert.equal(requested.filter((url) => url === initial).length, 1);
  assert.equal(requested.filter((url) => url === redirected).length, 1);
});

test("blocks redirect cycles without requesting any URL twice", async () => {
  const snapshot = structuredClone(valid);
  const first = "https://cycle-one.example.net/report";
  const second = "https://cycle-two.example.net/report";
  snapshot.sources["stanford-economy"].url = first;
  const requested: string[] = [];

  const issues = await checkSourceHealth(
    snapshot,
    async (input) => {
      const url = String(input);
      requested.push(url);
      return new Response("", {
        status: 302,
        headers: { location: url === first ? second : first },
      });
    },
    publicResolver,
  );

  assert.ok(issues.some(
    (issue) => issue.sourceIds.includes("stanford-economy") && issue.severity === "block",
  ));
  assert.equal(requested.filter((url) => url === first).length, 1);
  assert.equal(requested.filter((url) => url === second).length, 1);
});

test("pins the validated public answer without a second resolver lookup", async () => {
  const snapshot = structuredClone(valid);
  const sourceUrl = "https://rebind.attacker.com/report";
  snapshot.sources["stanford-economy"].url = sourceUrl;
  let targetLookups = 0;
  const pins: Array<{ hostname: string; addresses: readonly string[] } | undefined> = [];

  const issues = await checkSourceHealth(
    snapshot,
    async (_input, _init, pin) => {
      pins.push(pin);
      return new Response("", { status: 200 });
    },
    async (hostname) => {
      if (hostname !== "rebind.attacker.com") return publicResolver();
      targetLookups += 1;
      return targetLookups === 1 ? ["93.184.216.34"] : ["10.0.0.9"];
    },
  );

  assert.equal(issues.some((issue) => issue.sourceIds.includes("stanford-economy")), false);
  assert.equal(targetLookups, 1);
  assert.deepEqual(
    pins.find((pin) => pin?.hostname === "rebind.attacker.com")?.addresses,
    ["93.184.216.34"],
  );
});

test("pins and revalidates each public redirect hostname", async () => {
  const snapshot = structuredClone(valid);
  const initial = "https://pin-one.example.net/report";
  const redirected = "https://pin-two.example.net/report";
  snapshot.sources["stanford-economy"].url = initial;
  const pins = new Map<string, readonly string[]>();

  const issues = await checkSourceHealth(
    snapshot,
    async (input, _init, pin) => {
      pins.set(String(input), pin?.addresses ?? []);
      return String(input) === initial
        ? new Response("", { status: 302, headers: { location: redirected } })
        : new Response("", { status: 200 });
    },
    async (hostname) =>
      hostname === "pin-one.example.net"
        ? ["93.184.216.34"]
        : hostname === "pin-two.example.net"
          ? ["1.1.1.1"]
          : publicResolver(),
  );

  assert.equal(issues.some((issue) => issue.sourceIds.includes("stanford-economy")), false);
  assert.deepEqual(pins.get(initial), ["93.184.216.34"]);
  assert.deepEqual(pins.get(redirected), ["1.1.1.1"]);
});

test("the production transport uses its supplied pin while preserving Host and SNI", async () => {
  let connectionAddress: string | undefined;
  let connectionFamily: number | undefined;
  let requestOptions: Parameters<NodeRequester>[1] | undefined;
  const requester = ((
    _url: URL,
    options: Parameters<NodeRequester>[1],
    onResponse: Parameters<NodeRequester>[2],
  ) => {
    requestOptions = options;
    return ({
      once() {
        return this;
      },
      end() {
        const pinnedLookup = options.lookup as (
          hostname: string,
          options: unknown,
          callback: (
            error: NodeJS.ErrnoException | null,
            address: string,
            family: number,
          ) => void,
        ) => void;
        pinnedLookup(
          "rebind.attacker.com",
          { family: 4 },
          (_error, address, family) => {
            connectionAddress = address;
            connectionFamily = family;
          },
        );
        onResponse({
          statusCode: 200,
          headers: {},
          resume() {},
        } as Parameters<NodeRequester>[2] extends (response: infer T) => void ? T : never);
      },
      destroy() {},
    }) as unknown as ReturnType<NodeRequester>;
  }) as NodeRequester;
  const transport = createPinnedSourceFetcher(requester);

  const response = await transport(
    "https://rebind.attacker.com/report",
    { redirect: "manual" },
    { hostname: "rebind.attacker.com", addresses: ["93.184.216.34"] },
  );

  assert.equal(response.status, 200);
  assert.equal(connectionAddress, "93.184.216.34");
  assert.equal(connectionFamily, 4);
  assert.equal(requestOptions?.hostname, "rebind.attacker.com");
  assert.equal(requestOptions?.servername, "rebind.attacker.com");
  assert.equal((requestOptions?.headers as Record<string, string>).host, "rebind.attacker.com");
});
