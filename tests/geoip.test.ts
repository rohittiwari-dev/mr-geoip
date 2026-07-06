import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { GeoIP } from "../src/GeoIP";
import { lookup } from "../src/singleton";
import {
  InvalidIPError,
  DatabaseNotFoundError,
  CustomStoreNotConfiguredError,
} from "../src/errors";

const DATA_DIR = join(import.meta.dirname!, "..", "data");
const CUSTOM_FILE = join(
  import.meta.dirname!,
  "fixtures",
  "geoip-integration-test.json",
);

async function cleanup() {
  for (const f of [CUSTOM_FILE, `${CUSTOM_FILE}.tmp`]) {
    try {
      await unlink(f);
    } catch {}
  }
}

// =========================================================================
// Top-level lookup() — one-liner API
// =========================================================================

describe("lookup (one-liner)", () => {
  it("works with zero config — no create, no await", () => {
    const result = lookup("8.8.8.8");
    expect(result.ip).toBe("8.8.8.8");
    expect(result.countryCode).toBe("US");
    expect(result.asn).toBe(15169);
    expect(result.organization).toContain("Google");
  });

  it("returns full IpDetails shape (traits omitted by default)", () => {
    const result = lookup("8.8.8.8");
    const keys = [
      "ip",
      "country",
      "countryCode",
      "subdivision",
      "subdivisionCode",
      "continent",
      "continentCode",
      "city",
      "postalCode",
      "euMember",
      "timezone",
      "coordinates",
      "asn",
      "organization",
      "network",
    ];
    for (const key of keys) {
      expect(result).toHaveProperty(key);
    }
    expect(result).not.toHaveProperty("traits");
  });

  it("includes traits key when requested in lookup options", () => {
    const result = lookup("8.8.8.8", { traits: true });
    expect(result).toHaveProperty("traits");
    expect(result.traits).toBeDefined();
    expect(result.traits?.isAnonymous).toBe(false);
  });

  it("throws InvalidIPError for invalid input", () => {
    expect(() => lookup("not-valid")).toThrow(InvalidIPError);
    expect(() => lookup("")).toThrow(InvalidIPError);
  });

  it("handles private IPs gracefully (all-null geo)", () => {
    const result = lookup("10.0.0.1");
    expect(result.ip).toBe("10.0.0.1");
    expect(result.country).toBeNull();
    expect(result.asn).toBeNull();
  });

  it("returns cached results on repeated calls", () => {
    const a = lookup("1.1.1.1");
    const b = lookup("1.1.1.1");
    expect(a).toEqual(b);
  });
});

// =========================================================================
// GeoIP class — advanced API
// =========================================================================

describe("GeoIP", () => {
  afterEach(cleanup);

  // -----------------------------------------------------------------------
  // Factory (synchronous)
  // -----------------------------------------------------------------------

  describe("create", () => {
    it("creates an instance synchronously — no await needed", () => {
      const geo = GeoIP.create();
      expect(geo).toBeInstanceOf(GeoIP);
    });

    it("accepts config options", () => {
      const geo = GeoIP.create({
        cache: { maxSize: 500, ttlMs: 30_000 },
      });
      expect(geo).toBeInstanceOf(GeoIP);
    });

    it("throws DatabaseNotFoundError for missing user dataDir", () => {
      expect(() => GeoIP.create({ dataDir: "./nonexistent" })).toThrow(
        DatabaseNotFoundError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  describe("lookup", () => {
    it("returns IpDetails for a known IP", () => {
      const geo = GeoIP.create();
      const result = geo.lookup("8.8.8.8");

      expect(result.ip).toBe("8.8.8.8");
      expect(result.countryCode).toBe("US");
      expect(result.asn).toBe(15169);
      expect(result.organization).toContain("Google");
      expect(result.network).toBeDefined();
      expect(result.coordinates).toBeDefined();
    });

    it("returns all-null fields for a private IP", () => {
      const geo = GeoIP.create();
      const result = geo.lookup("10.0.0.1");

      expect(result.ip).toBe("10.0.0.1");
      expect(result.country).toBeNull();
      expect(result.asn).toBeNull();
    });

    it("throws InvalidIPError for invalid input", () => {
      const geo = GeoIP.create();
      expect(() => geo.lookup("not-valid")).toThrow(InvalidIPError);
    });

    it("omits traits key by default when GeoIP is created without traits config", () => {
      const geo = GeoIP.create();
      const result = geo.lookup("8.8.8.8");
      expect(result).not.toHaveProperty("traits");
    });

    it("includes traits key when configured during GeoIP creation", () => {
      const geo = GeoIP.create({ traits: true });
      const result = geo.lookup("8.8.8.8");
      expect(result).toHaveProperty("traits");
      expect(result.traits).toBeDefined();
    });

    it("allows overriding traits option on individual lookup calls", () => {
      const geo = GeoIP.create({ traits: false });
      
      const withTraits = geo.lookup("8.8.8.8", { traits: true });
      expect(withTraits).toHaveProperty("traits");

      const withoutTraits = geo.lookup("8.8.8.8", { traits: false });
      expect(withoutTraits).not.toHaveProperty("traits");
    });
  });

  // -----------------------------------------------------------------------
  // Cache
  // -----------------------------------------------------------------------

  describe("caching", () => {
    it("caches lookups and reports stats", () => {
      const geo = GeoIP.create({ cache: { maxSize: 100 } });

      geo.lookup("8.8.8.8");
      geo.lookup("8.8.8.8"); // hit
      geo.lookup("1.1.1.1");

      const stats = geo.cacheStats();
      expect(stats).not.toBeNull();
      expect(stats!.hits).toBe(1);
      expect(stats!.misses).toBe(2);
      expect(stats!.size).toBe(2);
    });

    it("clearCache drops all cached entries", () => {
      const geo = GeoIP.create();
      geo.lookup("8.8.8.8");
      geo.clearCache();

      expect(geo.cacheStats()!.size).toBe(0);
    });

    it("returns null stats when cache is disabled", () => {
      const geo = GeoIP.create({ cache: false });
      geo.lookup("8.8.8.8");
      expect(geo.cacheStats()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Custom data
  // -----------------------------------------------------------------------

  describe("custom data", () => {
    it("setCustomData + lookup merges custom fields", async () => {
      const geo = GeoIP.create({
        customStore: { filePath: CUSTOM_FILE },
      });

      // Wait for store to be ready
      await new Promise((r) => setTimeout(r, 100));

      await geo.setCustomData("10.0.0.1", {
        country: "Internal",
        organization: "HQ",
      });

      const result = geo.lookup("10.0.0.1");
      expect(result.country).toBe("Internal");
      expect(result.organization).toBe("HQ");

      await geo.close();
    });

    it("custom data overrides MMDB values", async () => {
      const geo = GeoIP.create({
        customStore: { filePath: CUSTOM_FILE },
      });

      await geo.setCustomData("8.8.8.8", { country: "Custom Country" });

      const result = geo.lookup("8.8.8.8");
      expect(result.country).toBe("Custom Country");
      expect(result.asn).toBe(15169); // non-overridden field still from MMDB

      await geo.close();
    });

    it("setCustomDataBulk sets multiple entries", async () => {
      const geo = GeoIP.create({
        customStore: { filePath: CUSTOM_FILE },
      });

      await geo.setCustomDataBulk([
        { ip: "10.0.0.1", data: { organization: "Org1" } },
        { ip: "10.0.0.2", data: { organization: "Org2" } },
      ]);

      expect(geo.lookup("10.0.0.1").organization).toBe("Org1");
      expect(geo.lookup("10.0.0.2").organization).toBe("Org2");
      expect(geo.customDataSize).toBe(2);

      await geo.close();
    });

    it("removeCustomData removes an entry", async () => {
      const geo = GeoIP.create({
        customStore: { filePath: CUSTOM_FILE },
      });

      await geo.setCustomData("10.0.0.1", { city: "Test" });
      expect(await geo.removeCustomData("10.0.0.1")).toBe(true);
      expect(geo.hasCustomData("10.0.0.1")).toBe(false);

      await geo.close();
    });

    it("throws InvalidIPError on setCustomData with bad IP", async () => {
      const geo = GeoIP.create({
        customStore: { filePath: CUSTOM_FILE },
      });

      await expect(
        geo.setCustomData("not-ip", { city: "X" }),
      ).rejects.toThrow(InvalidIPError);

      await geo.close();
    });

    it("throws CustomStoreNotConfiguredError when store not configured", async () => {
      const geo = GeoIP.create();

      await expect(
        geo.setCustomData("10.0.0.1", { city: "X" }),
      ).rejects.toThrow(CustomStoreNotConfiguredError);
    });

    it("invalidates cache when custom data changes", async () => {
      const geo = GeoIP.create({
        cache: { maxSize: 100 },
        customStore: { filePath: CUSTOM_FILE },
      });

      const before = geo.lookup("10.0.0.1");
      expect(before.organization).toBeNull();

      await geo.setCustomData("10.0.0.1", { organization: "Custom" });

      const after = geo.lookup("10.0.0.1");
      expect(after.organization).toBe("Custom");

      await geo.close();
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe("lifecycle", () => {
    it("reload reloads databases and clears cache", () => {
      const geo = GeoIP.create();

      geo.lookup("8.8.8.8");
      expect(geo.cacheStats()!.size).toBe(1);

      geo.reload(); // sync!

      expect(geo.cacheStats()!.size).toBe(0);
      const result = geo.lookup("8.8.8.8");
      expect(result.countryCode).toBe("US");
    });

    it("customDataSize returns 0 when store not configured", () => {
      const geo = GeoIP.create();
      expect(geo.customDataSize).toBe(0);
    });
  });
});
