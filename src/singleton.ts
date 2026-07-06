import type { IpDetails, LookupOptions, LookupAsyncOptions } from "./types";
import { GeoIP } from "./GeoIP";

// ---------------------------------------------------------------------------
// Lazy-loaded default singleton
// ---------------------------------------------------------------------------

let instance: GeoIP | null = null;

function getDefault(): GeoIP {
  if (!instance) {
    instance = GeoIP.create();
  }
  return instance;
}

/**
 * Look up geolocation data for an IP address.
 *
 * Uses the bundled GeoLite2 databases — **no configuration required**.
 * The database is loaded lazily on the first call and cached in
 * memory for all subsequent lookups.
 *
 * @example
 * ```ts
 * import { lookup } from "mr-geopip";
 *
 * const info = lookup("8.8.8.8");
 * console.log(info.country);      // "United States"
 * console.log(info.asn);          // 15169
 * console.log(info.organization); // "Google LLC"
 * ```
 *
 * @throws {InvalidIPError} if `ip` is not a valid IPv4/IPv6 string.
 */
export function lookup(ip: string, options?: LookupOptions): IpDetails {
  return getDefault().lookup(ip, options);
}

/**
 * Asynchronously look up geolocation data for an IP address.
 *
 * Supports querying a fallback public API if the local MMDB databases
 * are missing or unreadable.
 *
 * @example
 * ```ts
 * import { lookupAsync } from "mr-geopip";
 *
 * const info = await lookupAsync("8.8.8.8");
 * ```
 */
export async function lookupAsync(ip: string, options?: LookupAsyncOptions): Promise<IpDetails> {
  return getDefault().lookupAsync(ip, options);
}
