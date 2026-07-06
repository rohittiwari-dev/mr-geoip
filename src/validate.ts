import { isIP as netIsIP } from "node:net";
import type { CustomIpData, CustomIpEntry } from "./types";
import { InvalidIPError } from "./errors";

/**
 * Returns `true` when `ip` is a valid IPv4 or IPv6 address.
 */
export function isValidIP(ip: string): boolean {
  return netIsIP(ip) !== 0;
}

/**
 * Returns `true` when `ip` is a valid IPv4 address.
 */
export function isValidIPv4(ip: string): boolean {
  return netIsIP(ip) === 4;
}

/**
 * Returns `true` when `ip` is a valid IPv6 address.
 */
export function isValidIPv6(ip: string): boolean {
  return netIsIP(ip) === 6;
}

/**
 * Validates the structural shape of custom IP data at runtime.
 * Throws a TypeError if types are mismatched.
 */
export function validateCustomIpData(
  data: unknown,
): asserts data is CustomIpData {
  if (data === null || typeof data !== "object") {
    throw new TypeError("Custom IP data must be a non-null object.");
  }

  const record = data as Record<string, unknown>;

  // Validate coordinates
  if (record.coordinates !== undefined && record.coordinates !== null) {
    const coords = record.coordinates;
    if (typeof coords !== "object" || coords === null) {
      throw new TypeError(
        "Coordinates must be an object { latitude, longitude }.",
      );
    }
    const cRec = coords as Record<string, unknown>;
    if (
      typeof cRec.latitude !== "number" ||
      typeof cRec.longitude !== "number"
    ) {
      throw new TypeError(
        "Coordinates latitude and longitude must be numbers.",
      );
    }
  }

  // Validate traits
  if (record.traits !== undefined && record.traits !== null) {
    const traits = record.traits;
    if (typeof traits !== "object" || traits === null) {
      throw new TypeError("Traits must be an object of boolean flags.");
    }
    const tRec = traits as Record<string, unknown>;
    for (const [key, val] of Object.entries(tRec)) {
      if (typeof val !== "boolean") {
        throw new TypeError(`Trait flag "${key}" must be a boolean.`);
      }
    }
  }

  // String properties
  const strings = [
    "country",
    "countryCode",
    "subdivision",
    "subdivisionCode",
    "continent",
    "continentCode",
    "city",
    "postalCode",
    "timezone",
    "organization",
    "network",
  ];
  for (const prop of strings) {
    if (
      record[prop] !== undefined &&
      record[prop] !== null &&
      typeof record[prop] !== "string"
    ) {
      throw new TypeError(`Property "${prop}" must be a string.`);
    }
  }

  // Numeric properties
  if (
    record.asn !== undefined &&
    record.asn !== null &&
    typeof record.asn !== "number"
  ) {
    throw new TypeError('Property "asn" must be a number.');
  }

  // Boolean properties
  if (
    record.euMember !== undefined &&
    record.euMember !== null &&
    typeof record.euMember !== "boolean"
  ) {
    throw new TypeError('Property "euMember" must be a boolean.');
  }
}

/**
 * Validates and creates a single `CustomIpEntry`.
 *
 * The returned object can be passed directly to `geo.setCustomData()`.
 *
 * @throws {InvalidIPError} if `ip` is not a valid IPv4/IPv6 string.
 * @throws {TypeError} if `data` has invalid field types.
 *
 * @example
 * ```ts
 * const entry = createCustomIpData("10.0.0.1", { country: "Internal" });
 * await geo.setCustomData(entry);
 * ```
 */
export function createCustomIpData(ip: string, data: CustomIpData): CustomIpEntry {
  if (!isValidIP(ip)) throw new InvalidIPError(ip);
  validateCustomIpData(data);
  return { ip, data };
}

/**
 * Validates and creates a batch of `CustomIpEntry` objects.
 *
 * The returned array can be passed directly to `geo.setCustomDataBulk()`.
 *
 * @throws {InvalidIPError} if any IP is invalid (fails fast).
 * @throws {TypeError} if any data has invalid field types.
 *
 * @example
 * ```ts
 * const entries = createCustomIpDataSet([
 *   { ip: "10.0.0.1", data: { country: "Internal" } },
 *   { ip: "10.0.0.2", data: { organization: "Branch" } },
 * ]);
 * await geo.setCustomDataBulk(entries);
 * ```
 */
export function createCustomIpDataSet(
  entries: ReadonlyArray<{ ip: string; data: CustomIpData }>,
): CustomIpEntry[] {
  return entries.map(({ ip, data }) => createCustomIpData(ip, data));
}
