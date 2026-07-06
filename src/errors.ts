/**
 * Base error class for all mr-geopip errors.
 * Consumers can catch `GeoIPError` to handle any library error.
 */
export class GeoIPError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GeoIPError";
  }
}

/**
 * Thrown when a lookup is attempted before `GeoIP.create()` completes.
 */
export class GeoIPNotInitializedError extends GeoIPError {
  constructor() {
    super("GeoIP not initialized. Call GeoIP.create() first.");
    this.name = "GeoIPNotInitializedError";
  }
}

/**
 * Thrown when the provided string is not a valid IPv4 or IPv6 address.
 */
export class InvalidIPError extends GeoIPError {
  public readonly ip: string;

  constructor(ip: string) {
    super(`Invalid IP address: "${ip}"`);
    this.name = "InvalidIPError";
    this.ip = ip;
  }
}

/**
 * Thrown when a required MMDB database file does not exist on disk.
 */
export class DatabaseNotFoundError extends GeoIPError {
  public readonly path: string;

  constructor(path: string) {
    super(`Database file not found: "${path}"`);
    this.name = "DatabaseNotFoundError";
    this.path = path;
  }
}

/**
 * Thrown when an MMDB database file exists but cannot be parsed.
 */
export class DatabaseReadError extends GeoIPError {
  public readonly path: string;

  constructor(path: string, cause?: Error) {
    super(
      `Failed to read database: "${path}"${cause ? ` — ${cause.message}` : ""}`,
      cause ? { cause } : undefined,
    );
    this.name = "DatabaseReadError";
    this.path = path;
  }
}

/**
 * Thrown when the custom data store is not configured but a
 * custom-data operation is attempted.
 */
export class CustomStoreNotConfiguredError extends GeoIPError {
  constructor() {
    super(
      "Custom data store is not configured. Pass a `customStore` option to GeoIP.create().",
    );
    this.name = "CustomStoreNotConfiguredError";
  }
}
