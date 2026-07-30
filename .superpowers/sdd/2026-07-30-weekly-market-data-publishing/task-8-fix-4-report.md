# Task 8 Fix Round 4: Recoverable Last-Good Replacement

## Status

Complete. The remaining Important finding is fixed locally.

Implementation commit: `9d82f42bb1b1e7dc961d28406101f397e47de5dc` (`Make last-good replacement recoverable`).

No deployment, automation, ledger, or `.openai/hosting.json` change was performed.

## Fix

Last-good replacement is now one recoverable transaction across the artifact directory and independent anchor:

1. The verified candidate is copied to a uniquely owned staging directory and validated against the prospective anchor.
2. A strict, atomically written transition record binds the unique staging/backup names and both old/new anchors.
3. The existing last-good directory moves to the bound backup; the staged candidate moves into place and is revalidated.
4. The new anchor commits atomically only after that validation.
5. The old backup is deleted only after the committed anchor is reread and matches the new identity.

On an in-process failure before anchor commit, recovery uses the still-trusted old anchor to validate and restore the backup. Startup runs the same recovery before loading last-good:

- old anchor + old backup restores the backup and removes the uncommitted candidate;
- old anchor + unswapped current removes the prepared staging directory;
- new anchor + matching current keeps the new artifact and removes the stale old backup;
- malformed, symlinked, unbound, missing, or identity-mismatched transition state fails closed and never re-anchors.

All transition paths are fixed children of the project `work` directory. Owner tokens and filenames have strict UUID-derived forms, filesystem objects are checked without following symlinks, and every directory is hash/manifest validated before removal or restoration.

## TDD Evidence

The three new tests first failed because transactional replacement and recovery did not exist. They now prove:

- a forced anchor-commit failure leaves the prior anchor and prior directory valid;
- a simulated crash after directory swap but before anchor commit restores the anchored backup on restart;
- a simulated crash after anchor commit but before cleanup keeps the new anchored directory and removes the stale backup.

The existing rollback test with a candidate-added route remains green and continues to verify recovery against the last-good manifest context.

## Verification

- Focused deployment/LKG tests: `69/69` passed.
- Full `npm run test:market`: `243/243` passed, including the Chromium behavior matrix.
- `npm test`: production build passed and rendered routes `8/8` passed.
- `npm run lint`: passed with no findings.
- `git diff --check`: passed.
- The real-filesystem crash fixtures double as bounded local replacement/recovery probes; all transition artifacts were cleaned.

## Remaining Concern

Live Cloudflare behavior was not exercised because external deployment was explicitly excluded.
