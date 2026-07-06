import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import {
  lookup,
  lookupAsync,
  lookupSafe,
  lookupSafeAsync,
  createCustomIpData,
  createCustomIpDataSet,
  IpDetails,
} from "../src/index";
import { GeoIP } from "../src/GeoIP";
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

      await expect(geo.setCustomData("not-ip", { city: "X" })).rejects.toThrow(
        InvalidIPError,
      );

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

  // =========================================================================
  // New Production Features Tests
  // =========================================================================

  describe("Custom Data Validation", () => {
    it("createCustomIpData validates IP and data, returns CustomIpEntry", () => {
      const entry = createCustomIpData("10.0.0.1", {
        country: "USA",
        coordinates: { latitude: 37.7, longitude: -122.4 },
      });
      // Returns { ip, data } — ready to pass to setCustomData
      expect(entry.ip).toBe("10.0.0.1");
      expect(entry.data.country).toBe("USA");
    });

    it("createCustomIpData rejects invalid IP", () => {
      expect(() => createCustomIpData("not-ip", { country: "X" })).toThrow(
        InvalidIPError,
      );
    });

    it("createCustomIpData rejects invalid data types", () => {
      expect(() =>
        createCustomIpData("10.0.0.1", { country: 123 as any }),
      ).toThrow(TypeError);

      expect(() =>
        createCustomIpData("10.0.0.1", {
          coordinates: { latitude: "bad" } as any,
        }),
      ).toThrow(TypeError);

      expect(() =>
        createCustomIpData("10.0.0.1", { traits: "bad" as any }),
      ).toThrow(TypeError);
    });

    it("createCustomIpDataSet validates a batch and returns entries", () => {
      const entries = createCustomIpDataSet([
        { ip: "10.0.0.1", data: { country: "A" } },
        { ip: "10.0.0.2", data: { country: "B" } },
      ]);
      expect(entries).toHaveLength(2);
      expect(entries[0].ip).toBe("10.0.0.1");
      expect(entries[1].data.country).toBe("B");
    });

    it("setCustomData accepts a CustomIpEntry directly", async () => {
      const geo = GeoIP.create({ customStore: { filePath: CUSTOM_FILE } });

      const entry = createCustomIpData("10.0.0.1", { organization: "Direct" });
      await geo.setCustomData(entry); // pass directly

      const result = geo.lookup("10.0.0.1");
      expect(result.organization).toBe("Direct");

      await geo.close();
    });

    it("setCustomDataBulk accepts createCustomIpDataSet output directly", async () => {
      const geo = GeoIP.create({ customStore: { filePath: CUSTOM_FILE } });

      const entries = createCustomIpDataSet([
        { ip: "10.0.0.1", data: { organization: "A" } },
        { ip: "10.0.0.2", data: { organization: "B" } },
      ]);
      await geo.setCustomDataBulk(entries); // pass directly

      expect(geo.lookup("10.0.0.1").organization).toBe("A");
      expect(geo.lookup("10.0.0.2").organization).toBe("B");

      await geo.close();
    });

    it("GeoIP.setCustomData still validates the payload inline", async () => {
      const geo = GeoIP.create({ customStore: { filePath: CUSTOM_FILE } });

      await expect(
        geo.setCustomData("10.0.0.1", { country: 123 as any }),
      ).rejects.toThrow(TypeError);

      await geo.close();
    });
  });

  describe("Advisory File Locking", () => {
    it("safely handles concurrent writes to the same custom store file", async () => {
      const geo = GeoIP.create({
        customStore: { filePath: CUSTOM_FILE, flushIntervalMs: 50 },
      });

      // Fire off multiple concurrent set calls
      await Promise.all([
        geo.setCustomData("10.0.0.1", { organization: "A" }),
        geo.setCustomData("10.0.0.2", { organization: "B" }),
        geo.setCustomData("10.0.0.3", { organization: "C" }),
      ]);

      // Delay to let the debounce write finish
      await new Promise((r) => setTimeout(r, 100));

      expect(geo.lookup("10.0.0.1").organization).toBe("A");
      expect(geo.lookup("10.0.0.2").organization).toBe("B");
      expect(geo.lookup("10.0.0.3").organization).toBe("C");

      await geo.close();
    });
  });

  describe("Database Metadata Inspection", () => {
    it("returns correct database metadata snapshot", () => {
      const geo = GeoIP.create();
      const meta = geo.dbMetadata;

      expect(meta.city).not.toBeNull();
      expect(meta.city!.databaseType).toContain("City");
      expect(typeof meta.city!.buildEpoch).toBe("number");
      expect(meta.city!.ipVersion).toBe(6);

      expect(meta.asn).not.toBeNull();
      expect(meta.asn!.databaseType).toContain("ASN");
      expect(typeof meta.asn!.buildEpoch).toBe("number");
    });
  });

  describe("Fallback API & Async Geolocation", () => {
    it("lookupAsync falls back to HTTP API when fallbackApi is enabled", async () => {
      // Mock global fetch to return a predefined response
      const mockResult = {
        country_name: "Mockland",
        country_code: "ML",
        region: "Mock Region",
        city: "Mock City",
        latitude: 12.34,
        longitude: 56.78,
        asn: 99999,
        org: "Mock ISP",
        in_eu: true,
      };

      let capturedUrl: string | null = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        capturedUrl = String(url);
        return {
          ok: true,
          json: async () => mockResult,
        } as any;
      }) as any;

      try {
        const geo = GeoIP.create({
          fallbackApi: { enabled: true },
        });

        // Set readers to null to force API fallback
        (geo as any).bundledReaders = null;
        (geo as any).userReaders = null;

        const result = await geo.lookupAsync("8.8.8.8");

        expect(capturedUrl).toContain("8.8.8.8");
        expect(result.country).toBe("Mockland");
        expect(result.countryCode).toBe("ML");
        expect(result.city).toBe("Mock City");
        expect(result.coordinates).toEqual({
          latitude: 12.34,
          longitude: 56.78,
        });
        expect(result.asn).toBe(99999);
        expect(result.organization).toBe("Mock ISP");
        expect(result.euMember).toBe(true);

        await geo.close();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("lookupAsync one-liner works as expected", async () => {
      // Direct one-liner async lookup (uses local DB)
      const result = await lookupAsync("8.8.8.8");
      expect(result.ip).toBe("8.8.8.8");
      expect(result.countryCode).toBe("US");
    });

    it("lookupSafe returns null for invalid or unmapped IPs", () => {
      // Invalid IP -> null
      expect(lookupSafe("not-an-ip")).toBeNull();

      // Unmapped loopback IP -> null (since no location data exists)
      expect(lookupSafe("127.0.0.1")).toBeNull();

      // Valid IP -> succeeds
      const result = lookupSafe("8.8.8.8");
      expect(result).not.toBeNull();
      expect(result!.countryCode).toBe("US");
    });

    it("lookupSafeAsync returns null for invalid or unmapped IPs", async () => {
      // Invalid IP -> null
      expect(await lookupSafeAsync("not-an-ip")).toBeNull();

      // Unmapped loopback IP -> null
      expect(await lookupSafeAsync("127.0.0.1")).toBeNull();

      // Valid IP -> succeeds
      const result = await lookupSafeAsync("8.8.8.8");
      expect(result).not.toBeNull();
      expect(result!.countryCode).toBe("US");
    });

    it("falls back to freeipapi.com when ipapi.co fails (Multi-Tier chain)", async () => {
      const mockFreeIpApiResult = {
        countryName: "Fallbackland",
        countryCode: "FB",
        cityName: "Fallback City",
      };

      const originalFetch = globalThis.fetch;
      const requestedUrls: string[] = [];

      globalThis.fetch = (async (url: any) => {
        const urlStr = String(url);
        requestedUrls.push(urlStr);

        if (urlStr.includes("://ipapi.co")) {
          // Tier 1 fails
          return {
            ok: false,
            status: 500,
          } as any;
        }

        // Tier 2 succeeds
        return {
          ok: true,
          json: async () => mockFreeIpApiResult,
        } as any;
      }) as any;

      try {
        const geo = GeoIP.create({
          fallbackApi: { enabled: true },
        });

        // Force fallback
        (geo as any).bundledReaders = null;
        (geo as any).userReaders = null;

        const result = await geo.lookupAsync("8.8.8.8");

        expect(requestedUrls).toHaveLength(2);
        expect(requestedUrls[0]).toContain("ipapi.co");
        expect(requestedUrls[1]).toContain("freeipapi.com");
        expect(result.country).toBe("Fallbackland");
        expect(result.countryCode).toBe("FB");

        await geo.close();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns empty details if all HTTP APIs in the chain fail", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        return {
          ok: false,
          status: 500,
        } as any;
      }) as any;

      try {
        const geo = GeoIP.create({
          fallbackApi: { enabled: true },
        });

        (geo as any).bundledReaders = null;
        (geo as any).userReaders = null;

        // Falls back to empty details on complete failure
        const result = await geo.lookupAsync("8.8.8.8");
        expect(result.ip).toBe("8.8.8.8");
        expect(result.country).toBeNull();

        await geo.close();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("supports custom HTTP headers and custom mapResult function", async () => {
      const originalFetch = globalThis.fetch;
      const headersPassed: any[] = [];
      const mockApiResponse = {
        some_nested_data: {
          nation: "CustomNation",
          code: "CN",
          metro: "CustomMetro",
        },
      };

      globalThis.fetch = (async (url: any, options: any) => {
        headersPassed.push(options?.headers);
        return {
          ok: true,
          json: async () => mockApiResponse,
        } as any;
      }) as any;

      try {
        const geo = GeoIP.create({
          fallbackApi: {
            enabled: true,
            urlTemplate: "https://my-api.com/{ip}",
            headers: {
              Authorization: "Bearer test-token",
              "x-api-key": "secret-key",
            },
            mapResult: (body: any): Partial<IpDetails> => ({
              country: body.some_nested_data.nation,
              countryCode: body.some_nested_data.code,
              city: body.some_nested_data.metro,
            }),
          },
        });

        (geo as any).bundledReaders = null;
        (geo as any).userReaders = null;

        const result = await geo.lookupAsync("8.8.8.8");
        expect(headersPassed[0]).toEqual({
          Authorization: "Bearer test-token",
          "x-api-key": "secret-key",
        });
        expect(result.country).toBe("CustomNation");
        expect(result.countryCode).toBe("CN");
        expect(result.city).toBe("CustomMetro");

        await geo.close();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
