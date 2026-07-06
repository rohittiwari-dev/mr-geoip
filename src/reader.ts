import { readFileSync, accessSync, constants } from "node:fs";
import { resolve } from "node:path";
import { Reader, type CityResponse, type AsnResponse } from "mmdb-lib";
import type { IpDetails } from "./types";
import { DatabaseNotFoundError, DatabaseReadError } from "./errors";
import { BUNDLED_DATA_DIR, DEFAULT_CITY_FILE, DEFAULT_ASN_FILE } from "./paths";

// ---------------------------------------------------------------------------
// Reader handle
// ---------------------------------------------------------------------------

export interface MmdbReaders {
  city: Reader<CityResponse>;
  asn: Reader<AsnResponse> | null;
  /** Absolute path to the data directory (for reload). */
  dataDir: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileExists(path: string): boolean {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute the network prefix in CIDR notation from an IP and the
 * prefix length returned by the MMDB tree traversal.
 */
function computeNetworkCIDR(ip: string, prefixLength: number): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    const ipNum =
      (((Number(parts[0]) << 24) |
        (Number(parts[1]) << 16) |
        (Number(parts[2]) << 8) |
        Number(parts[3])) >>>
        0);
    const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
    const net = (ipNum & mask) >>> 0;
    return `${(net >>> 24) & 0xff}.${(net >>> 16) & 0xff}.${(net >>> 8) & 0xff}.${net & 0xff}/${prefixLength}`;
  }
  return `${ip}/${prefixLength}`;
}

// ---------------------------------------------------------------------------
// Reader construction (synchronous)
// ---------------------------------------------------------------------------

/**
 * Open City + ASN MMDB readers **synchronously** from a given directory.
 *
 * Uses `fs.readFileSync` + `new Reader(buffer)` from `mmdb-lib`.
 * This is the same strategy used by `geoip-lite` — the database is
 * loaded into RAM once and all subsequent lookups are pure in-memory
 * binary searches.
 *
 * @param dataDir   Directory containing MMDB files.
 * @param cityFile  City database filename.
 * @param asnFile   ASN database filename.
 * @param options   `{ required }` — when `true`, throws if city DB is missing.
 */
export function openReadersSync(
  dataDir: string,
  cityFile: string = DEFAULT_CITY_FILE,
  asnFile: string = DEFAULT_ASN_FILE,
  options: { required?: boolean } = {},
): MmdbReaders | null {
  const required = options.required ?? true;
  const cityPath = resolve(dataDir, cityFile);
  const asnPath = resolve(dataDir, asnFile);

  // City DB
  if (!fileExists(cityPath)) {
    if (required) throw new DatabaseNotFoundError(cityPath);
    return null;
  }

  let city: Reader<CityResponse>;
  try {
    const buf = readFileSync(cityPath);
    city = new Reader<CityResponse>(buf);
  } catch (err) {
    throw new DatabaseReadError(
      cityPath,
      err instanceof Error ? err : undefined,
    );
  }

  // ASN DB (optional — graceful skip if missing)
  let asn: Reader<AsnResponse> | null = null;
  if (fileExists(asnPath)) {
    try {
      const buf = readFileSync(asnPath);
      asn = new Reader<AsnResponse>(buf);
    } catch (err) {
      throw new DatabaseReadError(
        asnPath,
        err instanceof Error ? err : undefined,
      );
    }
  }

  return { city, asn, dataDir };
}

// ---------------------------------------------------------------------------
// Lookup (synchronous)
// ---------------------------------------------------------------------------

/**
 * Perform a synchronous MMDB lookup and shape the result into `IpDetails`.
 */
export function performLookup(readers: MmdbReaders, ip: string): IpDetails {
  const cityResult = readers.city.get(ip);

  let asnResult: AsnResponse | null = null;
  let asnPrefix = 0;
  if (readers.asn) {
    const [rec, pfx] = readers.asn.getWithPrefixLength(ip);
    asnResult = rec;
    asnPrefix = pfx;
  }

  return {
    ip,

    // Geo
    country: cityResult?.country?.names?.en ?? null,
    countryCode: cityResult?.country?.iso_code ?? null,
    subdivision: cityResult?.subdivisions?.[0]?.names?.en ?? null,
    subdivisionCode: cityResult?.subdivisions?.[0]?.iso_code ?? null,
    continent: cityResult?.continent?.names?.en ?? null,
    continentCode: cityResult?.continent?.code ?? null,
    city: cityResult?.city?.names?.en ?? null,
    postalCode: cityResult?.postal?.code ?? null,
    euMember: !!(
      cityResult?.registered_country?.is_in_european_union ||
      cityResult?.country?.is_in_european_union
    ),
    timezone: cityResult?.location?.time_zone ?? null,
    coordinates:
      cityResult?.location?.latitude != null &&
      cityResult?.location?.longitude != null
        ? {
            latitude: cityResult.location.latitude,
            longitude: cityResult.location.longitude,
          }
        : null,

    // Network
    asn: asnResult?.autonomous_system_number ?? null,
    organization: asnResult?.autonomous_system_organization ?? null,
    network:
      asnResult && asnPrefix > 0
        ? computeNetworkCIDR(ip, asnPrefix)
        : null,

    // Traits
    traits: {
      isAnonymous: cityResult?.traits?.is_anonymous ?? false,
      isAnonymousProxy: cityResult?.traits?.is_anonymous_proxy ?? false,
      isAnonymousVpn: cityResult?.traits?.is_anonymous_vpn ?? false,
      isHostingProvider: cityResult?.traits?.is_hosting_provider ?? false,
      isLegitimateProxy: cityResult?.traits?.is_legitimate_proxy ?? false,
      isPublicProxy: cityResult?.traits?.is_public_proxy ?? false,
      isResidentialProxy: cityResult?.traits?.is_residential_proxy ?? false,
      isSatelliteProvider: cityResult?.traits?.is_satellite_provider ?? false,
      isTorExitNode: cityResult?.traits?.is_tor_exit_node ?? false,
      isAnycast: cityResult?.traits?.is_anycast ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

/**
 * Create an empty `IpDetails` shell (all fields `null` except boolean defaults).
 */
export function emptyIpDetails(ip: string): IpDetails {
  return {
    ip,
    country: null,
    countryCode: null,
    subdivision: null,
    subdivisionCode: null,
    continent: null,
    continentCode: null,
    city: null,
    postalCode: null,
    euMember: false,
    timezone: null,
    coordinates: null,
    asn: null,
    organization: null,
    network: null,
    traits: {
      isAnonymous: false,
      isAnonymousProxy: false,
      isAnonymousVpn: false,
      isHostingProvider: false,
      isLegitimateProxy: false,
      isPublicProxy: false,
      isResidentialProxy: false,
      isSatelliteProvider: false,
      isTorExitNode: false,
      isAnycast: false,
    },
  };
}

/**
 * Field-level merge of two `IpDetails` results.
 *
 * `primary` values take priority; any field that is `null` in
 * `primary` falls back to the corresponding `fallback` value.
 */
export function mergeResults(
  primary: IpDetails,
  fallback: IpDetails,
): IpDetails {
  return {
    ip: primary.ip,
    country: primary.country ?? fallback.country,
    countryCode: primary.countryCode ?? fallback.countryCode,
    subdivision: primary.subdivision ?? fallback.subdivision,
    subdivisionCode: primary.subdivisionCode ?? fallback.subdivisionCode,
    continent: primary.continent ?? fallback.continent,
    continentCode: primary.continentCode ?? fallback.continentCode,
    city: primary.city ?? fallback.city,
    postalCode: primary.postalCode ?? fallback.postalCode,
    euMember: primary.euMember || fallback.euMember,
    timezone: primary.timezone ?? fallback.timezone,
    coordinates: primary.coordinates ?? fallback.coordinates,
    asn: primary.asn ?? fallback.asn,
    organization: primary.organization ?? fallback.organization,
    network: primary.network ?? fallback.network,
    traits: (primary.traits || fallback.traits) ? {
      isAnonymous: !!(primary.traits?.isAnonymous || fallback.traits?.isAnonymous),
      isAnonymousProxy: !!(primary.traits?.isAnonymousProxy || fallback.traits?.isAnonymousProxy),
      isAnonymousVpn: !!(primary.traits?.isAnonymousVpn || fallback.traits?.isAnonymousVpn),
      isHostingProvider: !!(primary.traits?.isHostingProvider || fallback.traits?.isHostingProvider),
      isLegitimateProxy: !!(primary.traits?.isLegitimateProxy || fallback.traits?.isLegitimateProxy),
      isPublicProxy: !!(primary.traits?.isPublicProxy || fallback.traits?.isPublicProxy),
      isResidentialProxy: !!(primary.traits?.isResidentialProxy || fallback.traits?.isResidentialProxy),
      isSatelliteProvider: !!(primary.traits?.isSatelliteProvider || fallback.traits?.isSatelliteProvider),
      isTorExitNode: !!(primary.traits?.isTorExitNode || fallback.traits?.isTorExitNode),
      isAnycast: !!(primary.traits?.isAnycast || fallback.traits?.isAnycast),
    } : undefined,
  };
}
