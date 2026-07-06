import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Compute the directory of the current file in both ESM and CJS.
 */
function getCurrentDir(): string {
  try {
    if (import.meta.url) {
      return dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // CJS fallback
  }
  return __dirname;
}

/**
 * Absolute path to the MMDB databases bundled with the package.
 */
export const BUNDLED_DATA_DIR = resolve(getCurrentDir(), "..", "data");

export const DEFAULT_CITY_FILE = "GeoLite2-City.mmdb";
export const DEFAULT_ASN_FILE = "GeoLite2-ASN.mmdb";
