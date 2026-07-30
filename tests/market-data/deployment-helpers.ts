import type {
  PublishDependencies,
  PublishOptions,
} from "../../market-data/deployment.ts";
import type { PromotionResult } from "../../market-data/storage.ts";

type FakeOptions = {
  deployResults?: Array<string | Error>;
  onDeploy?: (directory: string, branch: string) => void;
  promoteError?: Error;
  restoreSnapshotError?: Error;
  verificationResults?: Array<undefined | Error>;
};

export type FakeDependencies = PublishDependencies & {
  actions: string[];
  copies: Array<{ from: string; to: string }>;
  deployments: Array<{ directory: string; branch: string }>;
  promoteCount: number;
  snapshotRestored: boolean;
  verifications: Array<{ baseUrl: string; directory: string }>;
};

const promotion: PromotionResult = {
  promoted: true,
  runId: "2026-08-01-saturday",
  archivedPath: "data/market/runs/2026-08-01-saturday.json",
  previousRunId: "2026-07-25-saturday",
  archivedSha256: "a".repeat(64),
  promotedSha256: "b".repeat(64),
};

export const publishOptions: PublishOptions = {
  runId: "2026-08-01-saturday",
  candidatePath: "data/market/candidate.json",
  reviewPath: "data/market/reviews/2026-08-01-saturday.json",
  candidateDirectory: "work/pages-candidate",
  lastGoodDirectory: "work/pages-last-good",
  productionBaseUrl: "https://aimarket.tycreation.online",
  routes: [
    "/",
    "/stocks",
    "/compute",
    "/energy",
    "/models",
    "/sic",
    "/archive",
    "/archive/2026-07",
    "/market-brief/",
  ],
};

export function fakeDependencies(options: FakeOptions = {}): FakeDependencies {
  const deployments: FakeDependencies["deployments"] = [];
  const verifications: FakeDependencies["verifications"] = [];
  const copies: FakeDependencies["copies"] = [];
  const actions: string[] = [];
  let deployIndex = 0;
  let verificationIndex = 0;

  return {
    actions,
    copies,
    deployments,
    promoteCount: 0,
    snapshotRestored: false,
    verifications,
    async deploy(directory, branch) {
      deployments.push({ directory, branch });
      actions.push(`deploy:${branch}:${directory}`);
      options.onDeploy?.(directory, branch);
      const result =
        options.deployResults?.[deployIndex++] ??
        `https://${branch}.ai-market-atlas.pages.dev`;
      if (result instanceof Error) throw result;
      return result;
    },
    async verify(baseUrl, directory) {
      verifications.push({ baseUrl, directory });
      actions.push(`verify:${baseUrl}`);
      const result = options.verificationResults?.[verificationIndex++];
      if (result instanceof Error) throw result;
    },
    async copyDirectory(from, to) {
      copies.push({ from, to });
      actions.push(`copy:${from}:${to}`);
    },
    async promote() {
      this.promoteCount += 1;
      actions.push("promote");
      if (options.promoteError) throw options.promoteError;
      return promotion;
    },
    async restoreSnapshot() {
      actions.push("restore-snapshot");
      if (options.restoreSnapshotError) throw options.restoreSnapshotError;
      this.snapshotRestored = true;
    },
  };
}
