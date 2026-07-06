import type {
  CacheStats,
  CustomIpData,
  CustomIpEntry,
  GeoIPConfig,
  IpDetails,
  LookupOptions,
  GeoIPMetadata,
  LookupAsyncOptions,
  AutoUpdateConfig,
  FallbackApiConfig,
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
import { isValidIP, validateCustomIpData } from "./validate";
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
  private bundledReaders: MmdbReaders | null;
  private userReaders: MmdbReaders | null;
  private readonly cache: GeoIPCache | null;
  private customStore: CustomDataStore | null;
  private customStoreReady: Promise<void> | null;
  private readonly userDataDir: string | null;
  private readonly cityDbFile: string;
  private readonly asnDbFile: string;
  private readonly includeTraitsByDefault: boolean;
  private autoUpdateTimer: ReturnType<typeof setInterval> | null = null;
  private readonly fallbackApiConfig: FallbackApiConfig | null = null;

  // -----------------------------------------------------------------------
  // Construction (private — use static create())
  // -----------------------------------------------------------------------

  private constructor(
    bundledReaders: MmdbReaders | null,
    userReaders: MmdbReaders | null,
    cache: GeoIPCache | null,
    customStore: CustomDataStore | null,
    customStoreReady: Promise<void> | null,
    userDataDir: string | null,
    cityDbFile: string,
    asnDbFile: string,
    includeTraitsByDefault: boolean,
    fallbackApiConfig: FallbackApiConfig | null,
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
    this.fallbackApiConfig = fallbackApiConfig;
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
    const fallbackEnabled = config.fallbackApi?.enabled ?? false;

    // 1. Open bundled readers (graceful fallback if enabled)
    let bundledReaders: MmdbReaders | null = null;
    try {
      bundledReaders = openReadersSync(
        BUNDLED_DATA_DIR,
        cityDbFile,
        asnDbFile,
        { required: true },
      );
    } catch (err) {
      if (!fallbackEnabled) {
        throw err;
      }
    }

    // 2. Open user's readers (graceful fallback if enabled)
    let userReaders: MmdbReaders | null = null;
    if (config.dataDir) {
      try {
        userReaders = openReadersSync(
          config.dataDir,
          cityDbFile,
          asnDbFile,
          { required: true },
        );
      } catch (err) {
        if (!fallbackEnabled) {
          throw err;
        }
      }
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
      config.fallbackApi ?? null,
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

    // 6. Start auto-updater scheduler if configured
    if (config.autoUpdate) {
      instance.startAutoUpdate(config.autoUpdate);
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

    // 2. Bundled DB lookup (if loaded)
    let result: IpDetails | null = null;
    if (this.bundledReaders) {
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
    }

    if (!result) {
      result = emptyIpDetails(ip);
    }

    // 4. Custom store overlay (if configured + ready)
    if (this.customStore) {
      const custom = this.customStore.get(ip);
      if (custom) {
        result = applyCustomData(result, custom);
      }
    }

    // 5. Populate cache (always with full result)
    if (this.cache && this.bundledReaders) {
      this.cache.set(ip, result);
    }

    if (!includeTraits) {
      const { traits, ...rest } = result;
      return rest;
    }

    return result;
  }

  /**
   * Asynchronously look up geolocation data for an IP address.
   *
   * Supports querying a fallback public API if the local MMDB databases
   * are missing/empty (and `fallbackApi.enabled` is configured to `true`).
   */
  async lookupAsync(ip: string, options?: LookupAsyncOptions): Promise<IpDetails> {
    if (!isValidIP(ip)) {
      throw new InvalidIPError(ip);
    }

    const includeTraits = options?.traits ?? this.includeTraitsByDefault;
    const bypassCache = options?.bypassCache ?? false;

    // 1. Cache hit?
    if (this.cache && !bypassCache) {
      const cached = this.cache.get(ip);
      if (cached) {
        if (!includeTraits) {
          const { traits, ...rest } = cached;
          return rest;
        }
        return cached;
      }
    }

    let result: IpDetails | null = null;

    // 2. Try Local MMDB Lookups first (if loaded)
    if (this.bundledReaders) {
      try {
        result = performLookup(this.bundledReaders, ip);
      } catch {
        result = emptyIpDetails(ip);
      }

      if (this.userReaders) {
        try {
          const userResult = performLookup(this.userReaders, ip);
          result = mergeResults(userResult, result);
        } catch {}
      }
    }

    // 3. Fallback to API if database was not found/loaded and fallback is enabled
    if (!result && this.fallbackApiConfig?.enabled) {
      try {
        result = await this.queryFallbackApi(ip);
      } catch (err: any) {
        // Fallback failed too — default to empty details
        result = emptyIpDetails(ip);
      }
    }

    // Default to empty details if both MMDB and API lookup yielded nothing
    if (!result) {
      result = emptyIpDetails(ip);
    }

    // 4. Custom store overlay (if configured + ready)
    if (this.customStore) {
      const custom = this.customStore.get(ip);
      if (custom) {
        result = applyCustomData(result, custom);
      }
    }

    // 5. Populate cache (always with full result)
    if (this.cache && !bypassCache && (this.bundledReaders || result.country || result.asn)) {
      this.cache.set(ip, result);
    }

    if (!includeTraits) {
      const { traits, ...rest } = result;
      return rest;
    }

    return result;
  }

  /**
   * Safe version of `lookup(ip)`.
   *
   * - Returns `null` if the IP address is invalid (instead of throwing `InvalidIPError`).
   * - Returns `null` if no geolocation or ASN data is resolved (e.g. for loopback or private ranges).
   */
  lookupSafe(ip: string, options?: LookupOptions): IpDetails | null {
    if (!isValidIP(ip)) return null;
    try {
      const res = this.lookup(ip, options);
      if (!res.country && !res.asn && !res.city && !res.organization) {
        return null;
      }
      return res;
    } catch {
      return null;
    }
  }

  /**
   * Safe version of `lookupAsync(ip)`.
   *
   * - Returns `null` if the IP address is invalid (instead of throwing `InvalidIPError`).
   * - Returns `null` if no geolocation or ASN data is resolved.
   */
  async lookupSafeAsync(ip: string, options?: LookupAsyncOptions): Promise<IpDetails | null> {
    if (!isValidIP(ip)) return null;
    try {
      const res = await this.lookupAsync(ip, options);
      if (!res.country && !res.asn && !res.city && !res.organization) {
        return null;
      }
      return res;
    } catch {
      return null;
    }
  }

  private async queryFallbackApi(ip: string): Promise<IpDetails> {
    const customTemplate = this.fallbackApiConfig?.urlTemplate;
    const timeoutMs = this.fallbackApiConfig?.timeoutMs ?? 3000;

    if (customTemplate) {
      return this.querySingleUrl(ip, customTemplate, timeoutMs);
    }

    const chain = [
      "https://freeipapi.com/api/json/{ip}",
      "https://ipapi.co/{ip}/json/",
    ];

    const errors: Error[] = [];
    for (const template of chain) {
      try {
        const res = await this.querySingleUrl(ip, template, timeoutMs);
        if (res.country || res.asn || res.city) {
          return res;
        }
      } catch (err: any) {
        errors.push(err);
      }
    }

    throw new Error(`Fallback API chain failed: ${errors.map(e => e.message).join(", ")}`);
  }

  private async querySingleUrl(ip: string, template: string, timeoutMs: number): Promise<IpDetails> {
    const url = template.replace("{ip}", ip);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      const body = await response.json();
      return this.mapApiResult(ip, body);
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  private mapApiResult(ip: string, body: any): IpDetails {
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    const country = body.countryName || body.country_name || body.country || null;
    const countryCode = body.countryCode || body.country_code || null;
    const subdivision = body.regionName || body.region || null;
    const subdivisionCode = body.regionCode || body.region_code || body.region || null;
    const continent = body.continent || body.continent_name || null;
    const continentCode = body.continentCode || body.continent_code || null;
    const city = body.cityName || body.city || null;
    const postalCode = body.zipCode || body.postal || body.zip || null;
    const timezone = body.timeZone || body.timezone || null;

    let euMember = false;
    if (body.in_eu !== undefined) {
      euMember = !!body.in_eu;
    } else if (body.is_in_european_union !== undefined) {
      euMember = !!body.is_in_european_union;
    }

    const asn = body.asn ? Number(body.asn) : null;
    const organization = body.org || body.organization || body.asn_org || null;
    const network = body.network || null;

    const isAnonymous = !!(body.isProxy || body.is_anonymous || body.is_anonymous_proxy);

    return {
      ip,
      country,
      countryCode,
      subdivision,
      subdivisionCode,
      continent,
      continentCode,
      city,
      postalCode,
      euMember,
      timezone,
      coordinates: !Number.isNaN(latitude) && !Number.isNaN(longitude) ? { latitude, longitude } : null,
      asn,
      organization,
      network,
      traits: {
        isAnonymous,
        isAnonymousProxy: !!(body.is_anonymous_proxy || body.isProxy),
        isAnonymousVpn: !!body.is_anonymous_vpn,
        isHostingProvider: !!body.is_hosting,
        isLegitimateProxy: false,
        isPublicProxy: false,
        isResidentialProxy: false,
        isSatelliteProvider: false,
        isTorExitNode: !!body.is_tor,
        isAnycast: false,
      },
    };
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
   * Accepts either `(ip, data)` or a `CustomIpEntry` object (as returned
   * by `createCustomIpData()`).
   *
   * @throws {CustomStoreNotConfiguredError} if no `customStore` was provided.
   * @throws {InvalidIPError} if `ip` is not a valid IP address.
   */
  async setCustomData(entry: CustomIpEntry): Promise<void>;
  async setCustomData(ip: string, data: CustomIpData): Promise<void>;
  async setCustomData(
    ipOrEntry: string | CustomIpEntry,
    maybeData?: CustomIpData,
  ): Promise<void> {
    const store = await this.ensureCustomStore();

    let ip: string;
    let data: CustomIpData;

    if (typeof ipOrEntry === "string") {
      ip = ipOrEntry;
      data = maybeData!;
    } else {
      ip = ipOrEntry.ip;
      data = ipOrEntry.data;
    }

    if (!isValidIP(ip)) throw new InvalidIPError(ip);
    validateCustomIpData(data);

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

    for (const { ip, data } of entries) {
      if (!isValidIP(ip)) throw new InvalidIPError(ip);
      validateCustomIpData(data);
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

  get dbMetadata(): GeoIPMetadata {
    const cityMeta = this.bundledReaders?.city?.metadata;
    const asnMeta = this.bundledReaders?.asn?.metadata;

    return {
      city: cityMeta
        ? {
            buildEpoch: cityMeta.buildEpoch.getTime(),
            databaseType: cityMeta.databaseType,
            ipVersion: cityMeta.ipVersion,
            description: cityMeta.description,
          }
        : null,
      asn: asnMeta
        ? {
            buildEpoch: asnMeta.buildEpoch.getTime(),
            databaseType: asnMeta.databaseType,
            ipVersion: asnMeta.ipVersion,
            description: asnMeta.description,
          }
        : null,
    };
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

  private startAutoUpdate(config: AutoUpdateConfig): void {
    const intervalMs = config.intervalMs ?? 86_400_000;
    const updateFn = async () => {
      try {
        const { updateDb } = await import("./updater");
        await updateDb({
          outputDir: this.userDataDir ?? BUNDLED_DATA_DIR,
          lookbackMonths: config.lookbackMonths,
          cityUrl: config.cityUrl,
          asnUrl: config.asnUrl,
        });
        this.reload();
        config.onUpdate?.();
      } catch (err: any) {
        if (config.onError) {
          config.onError(err);
        } else {
          console.error("[mr-geopip] Auto-update failed:", err);
        }
      }
    };

    this.autoUpdateTimer = setInterval(() => {
      updateFn().catch(() => {});
    }, intervalMs);

    if (this.autoUpdateTimer && typeof this.autoUpdateTimer.unref === "function") {
      this.autoUpdateTimer.unref();
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Re-open MMDB database files from disk (e.g. after `updateDb()`).
   * Clears the cache automatically.
   */
  reload(): void {
    const fallbackEnabled = this.fallbackApiConfig?.enabled ?? false;
    try {
      this.bundledReaders = openReadersSync(
        BUNDLED_DATA_DIR,
        this.cityDbFile,
        this.asnDbFile,
        { required: true },
      );
    } catch (err) {
      if (!fallbackEnabled) {
        throw err;
      }
    }

    if (this.userDataDir) {
      try {
        this.userReaders = openReadersSync(
          this.userDataDir,
          this.cityDbFile,
          this.asnDbFile,
          { required: true },
        );
      } catch (err) {
        if (!fallbackEnabled) {
          throw err;
        }
      }
    }

    this.cache?.clear();
  }

  /**
   * Gracefully shut down — flushes the custom data store and clears
   * the cache. Call this when your process is shutting down.
   */
  async close(): Promise<void> {
    if (this.autoUpdateTimer) {
      clearInterval(this.autoUpdateTimer);
      this.autoUpdateTimer = null;
    }
    if (this.customStoreReady) {
      await this.customStoreReady;
    }
    if (this.customStore) await this.customStore.close();
    this.cache?.clear();
  }
}
