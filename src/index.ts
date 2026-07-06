// ---------------------------------------------------------------------------
// mr-geopip — Public API
// ---------------------------------------------------------------------------

// One-liner API
export { lookup, lookupAsync } from "./singleton";

// Advanced API
export { GeoIP } from "./GeoIP";

// Types
export type {
  IpDetails,
  Coordinates,
  IpTraits,
  CustomIpData,
  CustomIpEntry,
  GeoIPConfig,
  CacheConfig,
  CacheStats,
  CustomStoreConfig,
  UpdateConfig,
  LookupOptions,
  LookupAsyncOptions,
  AutoUpdateConfig,
  FallbackApiConfig,
  GeoIPMetadata,
} from "./types";

// Errors
export {
  GeoIPError,
  GeoIPNotInitializedError,
  InvalidIPError,
  DatabaseNotFoundError,
  DatabaseReadError,
  CustomStoreNotConfiguredError,
} from "./errors";

// Utilities
export {
  isValidIP,
  isValidIPv4,
  isValidIPv6,
  createCustomIpData,
  validateCustomIpData,
  createCustomIpDataSet,
} from "./validate";

// Updater
export { updateDb } from "./updater";
