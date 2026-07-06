import { LRUCache } from "lru-cache";
import type { CacheConfig, CacheStats, IpDetails } from "./types";

const DEFAULT_MAX_SIZE = 10_000;
const DEFAULT_TTL_MS = 3_600_000; // 1 hour

/**
 * Thin wrapper around `lru-cache` that tracks hit / miss statistics
 * and operates exclusively on `IpDetails` values keyed by IP string.
 */
export class GeoIPCache {
  private readonly cache: LRUCache<string, IpDetails>;
  private _hits = 0;
  private _misses = 0;

  constructor(config: CacheConfig = {}) {
    this.cache = new LRUCache<string, IpDetails>({
      max: config.maxSize ?? DEFAULT_MAX_SIZE,
      ttl: config.ttlMs ?? DEFAULT_TTL_MS,
    });
  }

  /**
   * Attempt to retrieve a cached lookup result.
   * Increments hit or miss counter accordingly.
   */
  get(ip: string): IpDetails | undefined {
    const result = this.cache.get(ip);
    if (result !== undefined) {
      this._hits++;
    } else {
      this._misses++;
    }
    return result;
  }

  /** Store a lookup result in the cache. */
  set(ip: string, details: IpDetails): void {
    this.cache.set(ip, details);
  }

  /** Remove a single entry (e.g. after custom-data mutation). */
  invalidate(ip: string): boolean {
    return this.cache.delete(ip);
  }

  /** Drop all entries and reset counters. */
  clear(): void {
    this.cache.clear();
    this._hits = 0;
    this._misses = 0;
  }

  /** Return a snapshot of cache statistics. */
  stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? this._hits / total : 0,
      size: this.cache.size,
      maxSize: this.cache.max,
    };
  }
}
