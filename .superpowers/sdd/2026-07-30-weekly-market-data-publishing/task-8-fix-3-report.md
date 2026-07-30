# Task 8 Fix Round 3: Semantic Brief and Independent Last-Good Trust

## Status

Complete. Both Important review findings and the artifact-ordering cleanup are fixed locally.

Implementation commit: `a7162f48dff7458111c05d75bbef0aee7e3f9afe` (`Bind brief semantics and last-good trust`).

No Cloudflare, Sites, or other external deployment or network publication was performed. The progress ledger, automation configuration, and `.openai/hosting.json` were not edited.

## Fixes

1. A market brief is now the exact deterministic projection of its bound snapshot. The shared validator compares every reader-visible and machine-visible field: title, summary, methodology, disclaimer, tags, labels, featured signal IDs, signal order and contents, source IDs, observations, and the run/cadence/cutoff envelope.
2. Wednesday generation no longer trusts an older complete brief as a content anchor. It regenerates the full canonical payload from the current snapshot. Changed-page priority comes from the signed snapshot page metadata, after which the deterministic page-balanced selection fills the five-feature limit.
3. Export uses the same shared full-payload validator before copying canonical JSON, public JSON, or embedded HTML payloads. Synchronized tampering across all copies therefore cannot bypass validation.
4. Last-known-good now has an independent trust anchor at `work/.pages-last-good-anchor.json`, outside the retained artifact directory. Its strict schema binds the run ID, candidate hash, artifact-tree hash, and canonical manifest hash.
5. Startup reads the anchor first and validates the retained directory against it. An existing last-good directory with a missing, malformed, unsafe, stale, or substituted anchor fails closed. The retained directory cannot silently become its own trust root.
6. The only automatic seed case is when both anchor and retained directory are absent. The current export must first pass production verification, then the copied directory is checked against its identities, and only then is the new anchor written atomically.
7. Successful production publication retains the old anchor in memory through rollback-sensitive work. The new last-good directory is validated before the new anchor is atomically installed; rollback deploy and post-deploy verification use the held old anchor.
8. Artifact paths are ordered by an explicit UTF-8 byte comparison before tree hashing, eliminating locale-dependent digest ordering.

## Adversarial RED to GREEN Evidence

### Important 1: complete brief semantics

- A mutation table changed title, summary, methodology, disclaimer, tags, and a featured subset that omitted the reviewed changed `/sic` page. Before the fix, all six variants were accepted by the partial validator. They now fail exact canonical comparison.
- A forged older brief with changed title and summary was previously reused on Wednesday. Generation now ignores it and deterministically recreates the snapshot-bound payload.
- Export tests synchronously tamper canonical JSON, public JSON, both embedded payloads, and their local agreement for title, summary, methodology, disclaimer, tags, and features. Agreement among forged copies no longer helps; the snapshot-semantic validator rejects every variant.
- Unchanged Wednesday coverage proves that deterministic regeneration preserves all snapshot-derived content while updating only the new snapshot envelope. Changed and newly added `/sic` coverage proves changed-page signals receive feature priority.

### Important 2: independent last-good anchor

- A fully self-consistent replacement of the retained directory previously had no independent comparison point. It now fails validation against the original anchor.
- Replacing the anchor with one that describes different content is rejected when checked against the retained directory.
- Missing anchor with an existing retained directory previously allowed the directory to validate itself. The orchestration now rejects before export, verification, or publication.
- Malformed and symlinked anchors fail closed.
- A clean first run with neither retained directory nor anchor verifies production, seeds the directory, creates the anchor, and revalidates their exact identity agreement.
- Existing rollback route-context coverage continues to prove that recovery uses the retained artifact manifest rather than the failed candidate's newly added archive routes. The orchestration now additionally validates that retained directory with the held old anchor before deployment and again through the bound verification context.

### Deterministic artifact ordering

A tree containing `Z.txt` and `a.txt` initially produced the locale-sensitive order rather than the hand-computed UTF-8 byte order. The hash now matches the bytewise serialization.

## Fresh Verification

```sh
npm run test:market
```

Output: `tests 240`, `pass 240`, `fail 0`. The pinned Chromium probe and complete browser behavior matrix passed.

```sh
npm test
```

Output: the production Vinext build completed and all 8 rendered-route tests passed.

```sh
npm run lint
git diff --check
```

Both completed with no findings.

Final focused regression:

```sh
node --experimental-strip-types --test \
  tests/market-data/artifact-tree.test.ts \
  tests/market-data/deploy-pages.test.ts \
  tests/market-data/deployment.test.ts \
  tests/market-data/export-pages.test.ts \
  tests/market-data/market-brief.test.ts
```

Output: `tests 119`, `pass 119`, `fail 0`.

```sh
npm run market:export
```

The real local build/export completed with 9 routes and these identities:

```text
candidate  84ec759f681d9a987f81cac435bc20daf528402e21117399cc7395f4f0366eed
tree       26194a7a4f001cd01406b458b268f223fe4d54017ac98f9626a180fbfd147efc
manifest   6436e332b2a744597109351c9cbaf36098afa34079ac673773a342968fa9a009
brief      91f1455ce7f9c7f8fd173404b76e8ad845f62097fb0530a2c6a839651f35ddf7
```

A bounded dry anchor exercise copied that real export to a temporary retained directory, constructed and atomically wrote its anchor, then read and validated the pair through the production functions. It confirmed:

```text
routes 9
treeMatches true
manifestMatches true
candidateMatches true
runMatches true
anchorOutsideDirectory true
anchorMode "600"
```

The dry anchor root and generated candidate export were removed afterward. No temporary/export artifacts remain in the worktree.

## Self-review

- The brief validator does not make set-only comparisons; it requires the exact deterministic order and complete canonical structure.
- The snapshot, not a prior brief, is the sole source of Wednesday changed-page feature priority.
- The anchor is not nested inside the content it authenticates and cannot be reconstructed from an existing retained directory.
- Anchor files have exact keys, safe run IDs, lowercase 64-character hashes, regular-file checks, exclusive temporary creation, restrictive permissions, and atomic rename.
- Rollback retains the prior anchor in memory until verified success and last-good replacement complete.
- Tree hashing length-prefixes the bytewise-sorted paths and contents, while the separate manifest hash continues to close the intentional manifest exclusion.

## Remaining Concerns

External deployment was intentionally excluded, so live Cloudflare behavior was not exercised. The previously deferred Vite environment-path Minor was not changed in this round.
