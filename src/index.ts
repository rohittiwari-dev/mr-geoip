// ---------------------------------------------------------------------------
// mr-geopip — Public API
// ---------------------------------------------------------------------------

// One-liner API
export { lookup } from "./singleton";

// Advanced API
export { GeoIP } from "./GeoIP";

// Types
export type {
  IpDetails,
  Coordinates,
  IpTraits,
  CustomIpData,
  GeoIPConfig,
  CacheConfig,
  CacheStats,
  CustomStoreConfig,
  UpdateConfig,
  LookupOptions,
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
export { isValidIP, isValidIPv4, isValidIPv6 } from "./validate";

// Updater
export { updateDb } from "./updater";
