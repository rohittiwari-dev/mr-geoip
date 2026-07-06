/**
 * Geographic coordinates for an IP location.
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * IP anonymity and proxy traits/flags.
 */
export interface IpTraits {
  isAnonymous: boolean;
  isAnonymousProxy: boolean;
  isAnonymousVpn: boolean;
  isHostingProvider: boolean;
  isLegitimateProxy: boolean;
  isPublicProxy: boolean;
  isResidentialProxy: boolean;
  isSatelliteProvider: boolean;
  isTorExitNode: boolean;
  isAnycast: boolean;
}

/**
 * Full IP geolocation lookup result.
 *
 * Every field except `ip` is nullable — a `null` value means the data
 * is unavailable for this particular IP address.
 */
export interface IpDetails {
  /** The queried IP address. */
  ip: string;

  /** Full country name (English). */
  country: string | null;
  /** ISO 3166-1 alpha-2 country code. */
  countryCode: string | null;

  /** Primary subdivision / region / state name (English). */
  subdivision: string | null;
  /** ISO 3166-2 subdivision code. */
  subdivisionCode: string | null;

  /** Continent name (English). */
  continent: string | null;
  /** Two-letter continent code (e.g. `"NA"`, `"EU"`). */
  continentCode: string | null;

  /** City name (English). */
  city: string | null;
  /** Postal / ZIP code. */
  postalCode: string | null;

  /** Whether the registered country is an EU member state. */
  euMember: boolean;
  /** IANA timezone identifier (e.g. `"America/New_York"`). */
  timezone: string | null;

  /** WGS-84 latitude / longitude. */
  coordinates: Coordinates | null;

  /** Autonomous System Number. */
  asn: number | null;
  /** Autonomous System organization name. */
  organization: string | null;
  /** CIDR network notation (e.g. `"8.8.8.0/24"`). */
  network: string | null;

  /** Anonymity and proxy trait flags. Included only if configured or requested. */
  traits?: IpTraits;
}

// ---------------------------------------------------------------------------
// Lookup options
// ---------------------------------------------------------------------------

export interface LookupOptions {
  /** Override the default configured behavior for including/excluding the `traits` key. */
  traits?: boolean;
}

export interface LookupAsyncOptions extends LookupOptions {
  /** Skip cache read / write checks if set to true. */
  bypassCache?: boolean;
}

// ---------------------------------------------------------------------------
// Custom data
// ---------------------------------------------------------------------------

/**
 * Custom data that can be attached to an IP address.
 *
 * This is a partial `IpDetails` (excluding `ip` which is set
 * automatically). When a custom entry exists for an IP, its fields
 * override the corresponding MMDB values during lookup.
 */
export type CustomIpData = Partial<Omit<IpDetails, "ip">>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * LRU cache settings.
 */
export interface CacheConfig {
  /** Maximum number of entries in the cache. @default 10_000 */
  maxSize?: number;
  /** Time-to-live per entry in milliseconds. @default 3_600_000 (1 hour) */
  ttlMs?: number;
}

/**
 * Cache hit / miss statistics.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  /** `hits / (hits + misses)` — `0` when no lookups have been made. */
  hitRate: number;
  /** Current number of entries in the cache. */
  size: number;
  /** Configured maximum size. */
  maxSize: number;
}

/**
 * Metadata about an opened MMDB database.
 */
export interface DatabaseMetadata {
  /** The epoch timestamp when this database was compiled by MaxMind. */
  buildEpoch: number;
  /** The type of database (e.g. `"GeoLite2-City"`). */
  databaseType: string;
  /** Supported IP version (4 or 6). */
  ipVersion: number;
  /** Free-form description of the database. */
  description?: string;
}

/**
 * Metadata snapshot of the active GeoIP databases (both city and asn).
 */
export interface GeoIPMetadata {
  city: DatabaseMetadata | null;
  asn: DatabaseMetadata | null;
}

/**
 * Custom data store settings.
 */
export interface CustomStoreConfig {
  /** Absolute or relative path to the JSON file used for persistence. */
  filePath: string;
  /**
   * How long (ms) to wait after the last write before flushing to disk.
   * @default 5_000
   */
  flushIntervalMs?: number;
}

/**
 * Top-level configuration for `GeoIP.create()`.
 *
 * By default the library uses its own bundled GeoLite2 databases —
 * **no configuration is required** for basic usage.
 *
 * When you provide a `dataDir`, those databases are opened as an
 * additional layer. On lookup, the user's data is tried first;
 * fields that are `null` in the user's result fall back to the
 * bundled database.
 */
export interface GeoIPConfig {
  /**
   * Optional directory containing your own MMDB database files.
   *
   * When provided, lookups query your databases first.
   * Any fields that are `null` in your DB result fall back to
   * the bundled GeoLite2 databases.
   *
   * Resolved relative to `process.cwd()` when a relative path.
   */
  dataDir?: string;

  /** City database filename inside `dataDir`. @default "GeoLite2-City.mmdb" */
  cityDbFile?: string;

  /** ASN database filename inside `dataDir`. @default "GeoLite2-ASN.mmdb" */
  asnDbFile?: string;

  /**
   * LRU cache configuration.
   * Pass `false` to disable caching entirely.
   * @default `{ maxSize: 10_000, ttlMs: 3_600_000 }`
   */
  cache?: CacheConfig | false;

  /**
   * Enable custom data persistence.
   * When provided, a JSON-backed store is created at the given path.
   */
  customStore?: CustomStoreConfig;

  /**
   * Whether to include the `traits` object in lookup results.
   * If false, the `traits` key is omitted entirely from the returned object.
   * @default false
   */
  traits?: boolean;

  /**
   * Options for enabling automatic background database updates.
   */
  autoUpdate?: AutoUpdateConfig;

  /**
   * Options for querying a public API if databases are missing/empty.
   */
  fallbackApi?: FallbackApiConfig;
}

/**
 * Configuration options for using a free public lookup API fallback.
 */
export interface FallbackApiConfig {
  /** If true, fallback queries will run when the database files are missing. */
  enabled: boolean;
  /** Custom URL template, where `{ip}` is replaced with the IP string. @default "https://ipapi.co/{ip}/json/" */
  urlTemplate?: string;
  /** Timeout in milliseconds for the HTTP request. @default 5000 */
  timeoutMs?: number;
}

/**
 * Configuration options for background auto-updates.
 */
export interface AutoUpdateConfig {
  /** How often (in milliseconds) to run update checks. @default 86_400_000 (24 hours) */
  intervalMs?: number;
  /** Lookup window for updates. */
  lookbackMonths?: number;
  /** Optional callback fired when the database has successfully updated and reloaded. */
  onUpdate?: () => void;
  /** Optional callback fired if an update fails. */
  onError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Updater
// ---------------------------------------------------------------------------

/**
 * Programmatic configuration for the database updater.
 */
export interface UpdateConfig {
  /** Output directory for downloaded MMDB files. @default "data" */
  outputDir?: string;
  /** Number of months to look back when probing download URLs. @default 12 */
  lookbackMonths?: number;
  /** When `true`, print candidate URLs without downloading. @default false */
  dryRun?: boolean;
  /** Override URL for the City database. */
  cityUrl?: string;
  /** Override URL for the ASN database. */
  asnUrl?: string;
}
