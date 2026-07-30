import type { ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

export function localFilePath(url: URL): string {
  return fileURLToPath(url);
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) return true;
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolve(hasExited(child));
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

export async function stopChildProcess(
  child: ChildProcess,
  graceMs = 3_000,
  forceMs = 1_000,
): Promise<void> {
  if (hasExited(child)) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, graceMs)) return;
  child.kill("SIGKILL");
  if (!(await waitForExit(child, forceMs))) {
    throw new Error("Child process did not exit after forced termination");
  }
}
