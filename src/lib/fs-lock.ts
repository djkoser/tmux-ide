import { mkdirSync, rmdirSync, statSync } from "node:fs";

/**
 * Cross-process mutex on a lock directory (mkdir is atomic on POSIX).
 * Serializes read-modify-write cycles on shared JSON stores where two
 * processes (CLI, daemon) writing the whole file would silently drop each
 * other's change.
 */

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** A held lock older than this is treated as abandoned by a crashed holder. */
const LOCK_STALE_MS = 5_000;
const LOCK_SPIN_MS = 5;
/**
 * Hard ceiling on waiting out live contention. Exceeding it throws rather
 * than proceeding alongside the current holder — two concurrent holders
 * silently lose updates, which is the exact failure this lock exists to
 * prevent. Critical sections are sub-ms and abandoned locks stale-break at
 * LOCK_STALE_MS, so hitting this means something is pathologically hung.
 */
const LOCK_WAIT_MAX_MS = 15_000;

/** Lock age in ms, or null when it vanished between checks (holder released). */
function lockAgeMs(lockPath: string): number | null {
  try {
    return Date.now() - statSync(lockPath).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Run fn while holding the mkdir mutex at lockPath (parent directory must
 * exist). Normal contention clears in a spin or two (critical sections are
 * sub-ms). A lock abandoned by a crashed holder is detected by age and
 * broken; live contention is waited out — never broken — so no two holders
 * ever run concurrently.
 */
export function withDirLock<T>(lockPath: string, fn: () => T): T {
  const runHeld = (): T => {
    try {
      return fn();
    } finally {
      try {
        rmdirSync(lockPath);
      } catch {
        // best-effort release
      }
    }
  };

  const deadline = Date.now() + LOCK_WAIT_MAX_MS;
  for (;;) {
    try {
      mkdirSync(lockPath); // throws EEXIST while held
      return runHeld();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const age = lockAgeMs(lockPath);
      // Vanished between mkdir and stat: the holder released — retry the
      // mkdir immediately. Breaking here would rmdir a lock another waiter
      // may have just acquired, putting two holders in the critical section.
      if (age === null) continue;
      if (age > LOCK_STALE_MS) {
        // Genuinely abandoned by a crashed holder — break it.
        try {
          rmdirSync(lockPath);
        } catch {
          // someone else broke it — retry immediately
        }
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`withDirLock ~ timed out waiting for lock ${lockPath}`, { cause: e });
      }
      sleepMs(LOCK_SPIN_MS);
    }
  }
}
