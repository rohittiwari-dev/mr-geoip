import { readFile, writeFile, rename, mkdir, stat, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { CustomIpData } from "./types";

/**
 * In-memory `Map` backed by a JSON file on disk.
 *
 * - **Reads** are synchronous O(1) from the Map.
 * - **Writes** are buffered and flushed to disk on a debounce timer.
 * - **Persistence** uses atomic writes (write `.tmp` then rename) to
 *   avoid partial writes on crash.
 */
export class CustomDataStore {
  private data: Map<string, CustomIpData> = new Map();
  private readonly filePath: string;
  private readonly flushIntervalMs: number;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  private constructor(filePath: string, flushIntervalMs: number) {
    this.filePath = filePath;
    this.flushIntervalMs = flushIntervalMs;
  }

  /**
   * Create a new store, loading any existing data from `filePath`.
   *
   * @param filePath       Path to the JSON persistence file.
   * @param flushIntervalMs  Debounce interval for disk writes (default 5 000 ms).
   */
  static async create(
    filePath: string,
    flushIntervalMs = 5_000,
  ): Promise<CustomDataStore> {
    const store = new CustomDataStore(filePath, flushIntervalMs);
    await store.load();
    return store;
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);

      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        this.data = new Map(Object.entries(parsed as Record<string, CustomIpData>));
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        // File does not exist yet — start with an empty map.
        return;
      }
      throw err;
    }
  }

  private async acquireLock(): Promise<void> {
    const lockPath = `${this.filePath}.lock`;
    const maxRetries = 3;
    const retryDelayMs = 200;
    const maxLockAgeMs = 10_000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await mkdir(lockPath);
        return;
      } catch (err: any) {
        if (err.code === "EEXIST") {
          try {
            const stats = await stat(lockPath);
            const age = Date.now() - stats.mtimeMs;
            if (age > maxLockAgeMs) {
              await rm(lockPath, { recursive: true, force: true });
              continue;
            }
          } catch {
            // Stat failed — proceed to retry
          }

          if (attempt === maxRetries) {
            throw new Error(`Failed to acquire lock for custom store: ${this.filePath} after ${maxRetries} attempts.`);
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        } else {
          throw err;
        }
      }
    }
  }

  private async releaseLock(): Promise<void> {
    const lockPath = `${this.filePath}.lock`;
    try {
      await rm(lockPath, { recursive: true, force: true });
    } catch {
      // Ignore release failures
    }
  }

  /** Immediately flush pending changes to disk (atomic write). */
  async flush(): Promise<void> {
    if (!this.dirty) return;

    await this.acquireLock();
    try {
      const obj: Record<string, CustomIpData> = Object.fromEntries(this.data);
      const json = JSON.stringify(obj, null, 2);
      const tmpPath = `${this.filePath}.tmp`;

      try {
        await mkdir(dirname(this.filePath), { recursive: true });
      } catch (err: any) {
        if (err?.code !== "EEXIST") throw err;
      }
      await writeFile(tmpPath, json, "utf-8");
      await rename(tmpPath, this.filePath);

      this.dirty = false;
    } finally {
      await this.releaseLock();
    }
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer !== null) return; // already scheduled
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch((err) => {
        console.error("[mr-geoip] custom store flush failed:", err);
      });
    }, this.flushIntervalMs);
  }

  // -----------------------------------------------------------------------
  // Read API (synchronous — Map lookups)
  // -----------------------------------------------------------------------

  /** Get custom data for a single IP. */
  get(ip: string): CustomIpData | undefined {
    return this.data.get(ip);
  }

  /** Check whether custom data exists for an IP. */
  has(ip: string): boolean {
    return this.data.has(ip);
  }

  /** Number of custom IP entries. */
  get size(): number {
    return this.data.size;
  }

  /** Iterate over all `[ip, data]` entries. */
  entries(): IterableIterator<[string, CustomIpData]> {
    return this.data.entries();
  }

  // -----------------------------------------------------------------------
  // Write API (mutates Map + schedules flush)
  // -----------------------------------------------------------------------

  /** Set custom data for a single IP. */
  set(ip: string, data: CustomIpData): void {
    this.data.set(ip, data);
    this.scheduleFlush();
  }

  /** Set custom data for multiple IPs at once (single flush). */
  setBulk(entries: ReadonlyArray<{ ip: string; data: CustomIpData }>): void {
    for (const { ip, data } of entries) {
      this.data.set(ip, data);
    }
    if (entries.length > 0) this.scheduleFlush();
  }

  /** Remove custom data for a single IP. Returns `true` if it existed. */
  delete(ip: string): boolean {
    const existed = this.data.delete(ip);
    if (existed) this.scheduleFlush();
    return existed;
  }

  /** Remove all custom data entries. */
  clear(): void {
    if (this.data.size === 0) return;
    this.data.clear();
    this.scheduleFlush();
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Flush pending writes and release the debounce timer.
   * Call this when shutting down the process gracefully.
   */
  async close(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
