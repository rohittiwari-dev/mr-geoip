import {
  lookup,
  lookupAsync,
  GeoIP,
  createCustomIpData,
  createCustomIpDataSet,
  isValidIP,
  isValidIPv4,
  isValidIPv6,
  updateDb,
  InvalidIPError,
  GeoIPError,
} from "./src/index";

// ============================================================================
// 1. ZERO-CONFIG ONE-LINER (simplest use-case)
// ============================================================================
console.log("═══ 1. Zero-Config One-Liner ═══\n");

const google = lookup("8.8.8.8");
console.log("Google DNS:", google.country, google.countryCode, google.asn);

const cloudflare = lookup("1.1.1.1");
console.log("Cloudflare:", cloudflare.country, cloudflare.asn, cloudflare.organization);

// With traits enabled per-call
const withTraits = lookup("8.8.8.8", { traits: true });
console.log("Traits:", withTraits.traits);

// ============================================================================
// 2. ASYNC LOOKUP (with optional HTTP fallback)
// ============================================================================
console.log("\n═══ 2. Async Lookup ═══\n");

const asyncResult = await lookupAsync("8.8.8.8");
console.log("Async result:", asyncResult.country, asyncResult.coordinates);

// ============================================================================
// 3. IP VALIDATION UTILITIES
// ============================================================================
console.log("\n═══ 3. IP Validation ═══\n");

console.log("isValidIP('8.8.8.8'):", isValidIP("8.8.8.8"));
console.log("isValidIPv4('192.168.1.1'):", isValidIPv4("192.168.1.1"));
console.log("isValidIPv6('::1'):", isValidIPv6("::1"));
console.log("isValidIP('not-an-ip'):", isValidIP("not-an-ip"));

// ============================================================================
// 4. ADVANCED INSTANCE (full config)
// ============================================================================
console.log("\n═══ 4. Advanced Instance ═══\n");

const geo = GeoIP.create({
  // dataDir: "./my-paid-dbs",              // uncomment if you have paid MaxMind DBs
  cache: { maxSize: 10_000, ttlMs: 300_000 }, // 10K entries, 5min TTL
  customStore: { filePath: "./custom-ips.json" },
  traits: false, // omit traits by default (smaller payload)
  // autoUpdate: {                          // uncomment to auto-check for DB updates
  //   intervalMs: 86_400_000,
  //   onUpdate: () => console.log("DB updated!"),
  //   onError: (err) => console.error("Update failed:", err),
  // },
  // fallbackApi: { enabled: true },        // uncomment for HTTP fallback when DB missing
});

// ============================================================================
// 5. CUSTOM DATA: VALIDATE → ASSOCIATE WITH IP → LOOKUP
// ============================================================================
console.log("═══ 5. Custom Data Overlay ═══\n");

// Step A: Validate a single record
const vpnServerData = createCustomIpData({
  country: "Netherlands",
  countryCode: "NL",
  city: "Amsterdam",
  organization: "Private VPN Corp",
  euMember: true,
  coordinates: { latitude: 52.3676, longitude: 4.9041 },
  traits: {
    isAnonymousVpn: true,
    isAnonymous: true,
  },
});

// Step B: Validate a batch of records
const officeRecords = createCustomIpDataSet([
  {
    country: "India",
    countryCode: "IN",
    city: "Bangalore",
    organization: "HQ Office",
    euMember: false,
  },
  {
    country: "United States",
    countryCode: "US",
    city: "San Francisco",
    organization: "US Branch",
    euMember: false,
  },
]);

// Step C: Associate validated data WITH specific IPs
await geo.setCustomData("10.0.0.1", vpnServerData);

// Step D: Bulk association — each record maps to an IP
await geo.setCustomDataBulk([
  { ip: "192.168.1.100", data: officeRecords[0] },
  { ip: "192.168.1.200", data: officeRecords[1] },
]);

// Step E: Lookup — custom data overlays on top of MMDB results
console.log("VPN Server (10.0.0.1):");
const vpnResult = geo.lookup("10.0.0.1", { traits: true });
console.log("  →", vpnResult.organization, vpnResult.city, vpnResult.traits?.isAnonymousVpn);

console.log("HQ Office (192.168.1.100):");
const hqResult = geo.lookup("192.168.1.100");
console.log("  →", hqResult.organization, hqResult.city, hqResult.countryCode);

console.log("US Branch (192.168.1.200):");
const usResult = geo.lookup("192.168.1.200");
console.log("  →", usResult.organization, usResult.city, usResult.countryCode);

// Step F: Check and remove
console.log("\nHas custom data for 10.0.0.1?", geo.hasCustomData("10.0.0.1"));
console.log("Custom data entries:", geo.customDataSize);

await geo.removeCustomData("10.0.0.1");
console.log("After removal, has 10.0.0.1?", geo.hasCustomData("10.0.0.1"));

// ============================================================================
// 6. CACHE MANAGEMENT
// ============================================================================
console.log("\n═══ 6. Cache Stats ═══\n");

// Trigger some lookups to populate cache
geo.lookup("8.8.8.8");
geo.lookup("1.1.1.1");
geo.lookup("8.8.8.8"); // cache hit

const stats = geo.cacheStats()!;
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);

geo.clearCache();
console.log("Cache cleared. Size:", geo.cacheStats()!.size);

// ============================================================================
// 7. DATABASE METADATA INSPECTION
// ============================================================================
console.log("\n═══ 7. Database Metadata ═══\n");

const meta = geo.dbMetadata;
if (meta.city) {
  console.log("City DB:", meta.city.databaseType, "| Built:", new Date(meta.city.buildEpoch).toISOString());
}
if (meta.asn) {
  console.log("ASN DB:", meta.asn.databaseType, "| Built:", new Date(meta.asn.buildEpoch).toISOString());
}

// ============================================================================
// 8. HOT RELOAD
// ============================================================================
console.log("\n═══ 8. Hot Reload ═══\n");

geo.reload(); // re-reads MMDB files from disk, clears cache
console.log("Reloaded. Cache size after reload:", geo.cacheStats()!.size);

// ============================================================================
// 9. ERROR HANDLING
// ============================================================================
console.log("\n═══ 9. Error Handling ═══\n");

try {
  lookup("not-a-valid-ip");
} catch (err) {
  if (err instanceof InvalidIPError) {
    console.log(`InvalidIPError caught: "${err.ip}" is not a valid IP`);
  }
  if (err instanceof GeoIPError) {
    console.log("(All mr-geopip errors extend GeoIPError)");
  }
}

// ============================================================================
// 10. GRACEFUL SHUTDOWN
// ============================================================================
console.log("\n═══ 10. Graceful Shutdown ═══\n");

await geo.close(); // stops auto-update timers, flushes custom store, clears cache
console.log("Instance closed gracefully.");

console.log("\n═══ All features demonstrated! ═══");
