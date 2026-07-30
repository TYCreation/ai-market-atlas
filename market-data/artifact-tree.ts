import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export const ARTIFACT_MANIFEST_NAME = ".market-deployment.json";

function lengthPrefix(length: number): Buffer {
  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64BE(BigInt(length));
  return prefix;
}

async function artifactFiles(
  root: string,
  directory: string,
): Promise<Array<{ path: string; relativePath: string }>> {
  const files: Array<{ path: string; relativePath: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).split(sep).join("/");
    if (relativePath === ARTIFACT_MANIFEST_NAME) continue;
    if (entry.isSymbolicLink()) {
      throw new Error(`artifact tree contains a symlink: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await artifactFiles(root, path)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`artifact tree contains a non-file: ${relativePath}`);
    }
    files.push({ path, relativePath });
  }
  return files;
}

/**
 * Hashes sorted UTF-8 relative paths and file bytes with 64-bit length prefixes.
 * The root deployment manifest is excluded because it stores this digest.
 */
export async function hashArtifactTree(directory: string): Promise<string> {
  const root = resolve(directory);
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("artifact tree root must be a real directory");
  }
  const files = (await artifactFiles(root, root)).sort((left, right) =>
    Buffer.compare(
      Buffer.from(left.relativePath, "utf8"),
      Buffer.from(right.relativePath, "utf8"),
    ),
  );
  const hash = createHash("sha256");
  for (const file of files) {
    const pathBytes = Buffer.from(file.relativePath, "utf8");
    const contents = await readFile(file.path);
    hash.update(lengthPrefix(pathBytes.length));
    hash.update(pathBytes);
    hash.update(lengthPrefix(contents.length));
    hash.update(contents);
  }
  return hash.digest("hex");
}
