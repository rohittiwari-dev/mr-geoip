import type {
  CacheStats,
  CustomIpData,
  GeoIPConfig,
  IpDetails,
  LookupOptions,
} from "./types";
import { GeoIPCache } from "./cache";
import { CustomDataStore } from "./custom-store";
import {
  BUNDLED_DATA_DIR,
  DEFAULT_CITY_FILE,
  DEFAULT_ASN_FILE,
  openReadersSync,
  performLookup,
  mergeResults,
  emptyIpDetails,
  type MmdbReaders,
} from "./reader";
import { isValidIP } from "./validate";
import {
  InvalidIPError,
  CustomStoreNotConfiguredError,
} from "./errors";

// ---------------------------------------------------------------------------
// Custom data merge helper
// ---------------------------------------------------------------------------

/**
 * Overlay `CustomIpData` onto a base `IpDetails`.
 *
 * Only explicitly-provided fields (not `undefined`) in `custom` override.
 * `traits` is shallow-merged so individual flags can be overridden.
 */
function applyCustomData(base: IpDetails, custom: CustomIpData): IpDetails {
  return {
    ip: base.ip,

    country: custom.country !== undefined ? custom.country : base.country,
    countryCode:
      custom.countryCode !== undefined
        ? custom.countryCode
        : base.countryCode,
    subdivision:
      custom.subdivision !== undefined
        ? custom.subdivision
        : base.subdivision,
    subdivisionCode:
      custom.subdivisionCode !== undefined
        ? custom.subdivisionCode
        : base.subdivisionCode,
    continent:
      custom.continent !== undefined ? custom.continent : base.continent,
    continentCode:
      custom.continentCode !== undefined
        ? custom.continentCode
        : base.continentCode,
    city: custom.city !== undefined ? custom.city : base.city,
    postalCode:
      custom.postalCode !== undefined ? custom.postalCode : base.postalCode,
    euMember:
      custom.euMember !== undefined ? custom.euMember : base.euMember,
    timezone:
      custom.timezone !== undefined ? custom.timezone : base.timezone,
    coordinates:
      custom.coordinates !== undefined
        ? custom.coordinates
        : base.coordinates,
    asn: custom.asn !== undefined ? custom.asn : base.asn,
    organization:
      custom.organization !== undefined
        ? custom.organization
        : base.organization,
    network: custom.network !== undefined ? custom.network : base.network,

    traits:
      custom.traits !== undefined
        ? { ...base.traits, ...custom.traits }
        : base.traits,
  };
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Framework-agnostic, runtime-agnostic IP geolocation service.
 *
 * Batteries-included: MMDB databases are bundled with the package.
 * No configuration is required for basic usage.
 *
 * @example
 * ```ts
 * // Simple — zero config
 * import { lookup } from "mr-geopip";
 * const info = lookup("8.8.8.8");
 *
 * // Advanced — custom DBs, cache, custom data
 * import { GeoIP } from "mr-geopip";
 * const geo = GeoIP.create({ dataDir: "./my-paid-dbs" });
 * ```
 */
export class GeoIP {
  private bundledReaders: MmdbReaders;
  private userReaders: MmdbReaders | null;
  private readonly cache: GeoIPCache | null;
  private customStore: CustomDataStore | null;
  private customStoreReady: Promise<void> | null;
  private readonly userDataDir: string | null;
  private readonly cityDbFile: string;
  private readonly asnDbFile: string;
  private readonly includeTraitsByDefault: boolean;

  // -----------------------------------------------------------------------
  // Construction (private — use static create())
  // -----------------------------------------------------------------------

  private constructor(
    bundledReaders: MmdbReaders,
    userReaders: MmdbReaders | null,
    cache: GeoIPCache | null,
    customStore: CustomDataStore | null,
    customStoreReady: Promise<void> | null,
    userDataDir: string | null,
    cityDbFile: string,
    asnDbFile: string,
    includeTraitsByDefault: boolean,
  ) {
    this.bundledReaders = bundledReaders;
    this.userReaders = userReaders;
    this.cache = cache;
    this.customStore = customStore;
    this.customStoreReady = customStoreReady;
    this.userDataDir = userDataDir;
    this.cityDbFile = cityDbFile;
    this.asnDbFile = asnDbFile;
    this.includeTraitsByDefault = includeTraitsByDefault;
  }

  /**
   * Create and initialise a new `GeoIP` instance.
   *
   * **This is synchronous** — no `await` needed. The MMDB databases
   * are loaded into RAM via `readFileSync` (same approach as
   * `geoip-lite`). If a `customStore` is configured, it loads
   * asynchronously in the background; lookups work immediately.
   *
   * @example
   * ```ts
   * // Minimal — just uses bundled databases
   * const geo = GeoIP.create();
   *
   * // With user DB override (merged over bundled)
   * const geo = GeoIP.create({ dataDir: "./my-paid-dbs" });
   *
   * // Full configuration
   * const geo = GeoIP.create({
   *   dataDir: "./my-paid-dbs",
   *   cache: { maxSize: 50_000, ttlMs: 300_000 },
   *   customStore: { filePath: "./custom-ips.json" },
   * });
   * ```
   */
  static create(config: GeoIPConfig = {}): GeoIP {
    const cityDbFile = config.cityDbFile ?? DEFAULT_CITY_FILE;
    const asnDbFile = config.asnDbFile ?? DEFAULT_ASN_FILE;

    // 1. Always open bundled readers
    const bundledReaders = openReadersSync(
      BUNDLED_DATA_DIR,
      cityDbFile,
      asnDbFile,
      { required: true },
    )!;

    // 2. Optionally open user's readers (merged over bundled)
    let userReaders: MmdbReaders | null = null;
    if (config.dataDir) {
      userReaders = openReadersSync(
        config.dataDir,
        cityDbFile,
        asnDbFile,
        { required: true },
      );
    }

    // 3. Cache
    const cache =
      config.cache === false ? null : new GeoIPCache(config.cache ?? {});

    // 4. Build instance first, then kick off async custom store load
    const instance = new GeoIP(
      bundledReaders,
      userReaders,
      cache,
      null, // customStore — will be set when ready
      null, // customStoreReady — set below
      config.dataDir ?? null,
      cityDbFile,
      asnDbFile,
      config.traits ?? false,
    );

    // 5. Custom store (loaded async in background — non-blocking)
    if (config.customStore) {
      instance.customStoreReady = CustomDataStore.create(
        config.customStore.filePath,
        config.customStore.flushIntervalMs,
      ).then((store) => {
        instance.customStore = store;
      });
    }

    return instance;
  }

  // -----------------------------------------------------------------------
  // Core lookup (synchronous, 3-layer merge)
  // -----------------------------------------------------------------------

  /**
   * Look up geolocation data for an IP address.
   *
   * **Merge order** (each layer fills in `null` gaps from the previous):
   * 1. User DB (if `dataDir` was provided)
   * 2. Bundled DB (always)
   * 3. Custom store overlay (if configured via `setCustomData`)
   *
   * @throws {InvalidIPError} if `ip` is not a valid IPv4/IPv6 string.
   */
  lookup(ip: string, options?: LookupOptions): IpDetails {
    if (!isValidIP(ip)) {
      throw new InvalidIPError(ip);
    }

    const includeTraits = options?.traits ?? this.includeTraitsByDefault;

    // 1. Cache hit?
    if (this.cache) {
      const cached = this.cache.get(ip);
      if (cached) {
        if (!includeTraits) {
          const { traits, ...rest } = cached;
          return rest;
        }
        return cached;
      }
    }

    // 2. Bundled DB lookup (always)
    let result: IpDetails;
    try {
      result = performLookup(this.bundledReaders, ip);
    } catch {
      result = emptyIpDetails(ip);
    }

    // 3. User DB lookup (if provided) — merge over bundled
    if (this.userReaders) {
      try {
        const userResult = performLookup(this.userReaders, ip);
        result = mergeResults(userResult, result);
      } catch {
        // User DB doesn't have this IP — keep bundled result
      }
    }

    // 4. Custom store overlay (if configured + ready)
    if (this.customStore) {
      const custom = this.customStore.get(ip);
      if (custom) {
        result = applyCustomData(result, custom);
      }
    }

    // 5. Populate cache (always with full result)
    if (this.cache) {
      this.cache.set(ip, result);
    }

    if (!includeTraits) {
      const { traits, ...rest } = result;
      return rest;
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Custom data management
  // -----------------------------------------------------------------------

  /**
   * Ensure the custom store is ready before writing.
   * The store loads async in the background; this awaits it.
   */
  private async ensureCustomStore(): Promise<CustomDataStore> {
    if (!this.customStoreReady && !this.customStore) {
      throw new CustomStoreNotConfiguredError();
    }
    if (this.customStoreReady) {
      await this.customStoreReady;
      this.customStoreReady = null;
    }
    if (!this.customStore) {
      throw new CustomStoreNotConfiguredError();
    }
    return this.customStore;
  }

  /**
   * Attach custom metadata to a specific IP address.
   *
   * @throws {CustomStoreNotConfiguredError} if no `customStore` was provided.
   * @throws {InvalidIPError} if `ip` is not a valid IP address.
   */
  async setCustomData(ip: string, data: CustomIpData): Promise<void> {
    const store = await this.ensureCustomStore();
    if (!isValidIP(ip)) throw new InvalidIPError(ip);

    store.set(ip, data);
    if (this.cache) this.cache.invalidate(ip);
  }

  /**
   * Attach custom metadata for multiple IPs in one batch.
   *
   * @throws {CustomStoreNotConfiguredError} if no `customStore` was provided.
   * @throws {InvalidIPError} if any IP is invalid (fails fast).
   */
  async setCustomDataBulk(
    entries: ReadonlyArray<{ ip: string; data: CustomIpData }>,
  ): Promise<void> {
    const store = await this.ensureCustomStore();

    for (const { ip } of entries) {
      if (!isValidIP(ip)) throw new InvalidIPError(ip);
    }

    store.setBulk(entries);

    if (this.cache) {
      for (const { ip } of entries) {
        this.cache.invalidate(ip);
      }
    }
  }

  /**
   * Remove custom data for an IP address.
   * @returns `true` if the entry existed and was removed.
   */
  async removeCustomData(ip: string): Promise<boolean> {
    const store = await this.ensureCustomStore();
    const removed = store.delete(ip);
    if (removed && this.cache) this.cache.invalidate(ip);
    return removed;
  }

  /**
   * Check whether custom data exists for an IP.
   */
  hasCustomData(ip: string): boolean {
    if (!this.customStore) return false;
    return this.customStore.has(ip);
  }

  /** Number of custom IP entries currently stored. */
  get customDataSize(): number {
    return this.customStore?.size ?? 0;
  }

  // -----------------------------------------------------------------------
  // Cache management
  // -----------------------------------------------------------------------

  /** Drop all cached lookup results. */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Return a snapshot of cache hit / miss statistics.
   * Returns `null` when caching is disabled.
   */
  cacheStats(): CacheStats | null {
    return this.cache?.stats() ?? null;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Re-open MMDB database files from disk (e.g. after `updateDb()`).
   * Clears the cache automatically.
   */
  reload(): void {
    this.bundledReaders = openReadersSync(
      BUNDLED_DATA_DIR,
      this.cityDbFile,
      this.asnDbFile,
      { required: true },
    )!;

    if (this.userDataDir) {
      this.userReaders = openReadersSync(
        this.userDataDir,
        this.cityDbFile,
        this.asnDbFile,
        { required: true },
      );
    }

    this.cache?.clear();
  }

  /**
   * Gracefully shut down — flushes the custom data store and clears
   * the cache. Call this when your process is shutting down.
   */
  async close(): Promise<void> {
    if (this.customStoreReady) {
      await this.customStoreReady;
    }
    if (this.customStore) await this.customStore.close();
    this.cache?.clear();
  }
}
