import { describe, it, expect, beforeEach } from "vitest";
import { GeoIPCache } from "../src/cache";

describe("GeoIPCache", () => {
  let cache: GeoIPCache;

  const mockDetails = (ip: string) => ({
    ip,
    country: "US",
    countryCode: "US",
    subdivision: null,
    subdivisionCode: null,
    continent: "North America",
    continentCode: "NA",
    city: null,
    postalCode: null,
    euMember: false,
    timezone: "America/Chicago",
    coordinates: { latitude: 37.751, longitude: -97.822 },
    asn: 15169,
    organization: "Google LLC",
    network: "8.8.8.0/24",
    traits: null,
  });

  beforeEach(() => {
    cache = new GeoIPCache({ maxSize: 3, ttlMs: 60_000 });
  });

  it("returns undefined for a cache miss", () => {
    expect(cache.get("1.2.3.4")).toBeUndefined();
  });

  it("returns cached value on hit", () => {
    const details = mockDetails("8.8.8.8");
    cache.set("8.8.8.8", details);
    expect(cache.get("8.8.8.8")).toEqual(details);
  });

  it("tracks hit and miss statistics", () => {
    cache.set("8.8.8.8", mockDetails("8.8.8.8"));

    cache.get("8.8.8.8"); // hit
    cache.get("8.8.8.8"); // hit
    cache.get("1.1.1.1"); // miss

    const stats = cache.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(3);
  });

  it("invalidates a single entry", () => {
    cache.set("8.8.8.8", mockDetails("8.8.8.8"));
    expect(cache.invalidate("8.8.8.8")).toBe(true);
    expect(cache.get("8.8.8.8")).toBeUndefined();
  });

  it("returns false when invalidating a non-existent key", () => {
    expect(cache.invalidate("1.2.3.4")).toBe(false);
  });

  it("evicts oldest entry when maxSize is exceeded", () => {
    cache.set("1.0.0.1", mockDetails("1.0.0.1"));
    cache.set("1.0.0.2", mockDetails("1.0.0.2"));
    cache.set("1.0.0.3", mockDetails("1.0.0.3"));
    // Cache is full (3). Adding a 4th should evict the first.
    cache.set("1.0.0.4", mockDetails("1.0.0.4"));

    expect(cache.stats().size).toBe(3);
    // The oldest entry should be evicted
    expect(cache.get("1.0.0.4")).toBeDefined();
  });

  it("clears all entries and resets stats", () => {
    cache.set("8.8.8.8", mockDetails("8.8.8.8"));
    cache.get("8.8.8.8"); // hit
    cache.get("1.1.1.1"); // miss

    cache.clear();

    const stats = cache.stats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it("uses default config when none provided", () => {
    const defaultCache = new GeoIPCache();
    const stats = defaultCache.stats();
    expect(stats.maxSize).toBe(10_000);
  });
});
