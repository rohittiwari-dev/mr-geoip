# mr-geopip

Production-grade, runtime-agnostic IP geolocation — one-liner API with batteries included.

- **One-liner** — `lookup("8.8.8.8")` — no init, no `await`, no config
- **Fast** — sub-millisecond in-memory lookups with configurable LRU cache
- **Runtime-agnostic** — works on Node.js ≥ 18, Bun, and Deno
- **Batteries included** — GeoLite2 MMDB databases bundled with the package
- **TypeScript first** — full type safety with `IpDetails` interface
- **Dual format** — ships ESM + CJS via `tsup`, with full `.d.ts` declarations

## Install

```bash
npm install mr-geopip
# or
bun add mr-geopip
```

## Quick Start

```ts
import { lookup } from "mr-geopip";

const info = lookup("8.8.8.8");
console.log(info.country);      // "United States"
console.log(info.countryCode);  // "US"
console.log(info.coordinates);  // { latitude: 37.751, longitude: -97.822 }
console.log(info.asn);          // 15169
console.log(info.organization); // "Google LLC"
console.log(info.network);     // "8.8.8.0/24"
```

That's it. No `.create()`, no `await`, no config files.

## What You Get

Every `lookup()` returns a fully-typed `IpDetails` object:

```ts
interface IpDetails {
  ip: string;
  country: string | null;
  countryCode: string | null;
  subdivision: string | null;      // e.g. "California"
  subdivisionCode: string | null;  // e.g. "CA"
  continent: string | null;
  continentCode: string | null;
  city: string | null;
  postalCode: string | null;
  euMember: boolean | null;
  timezone: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  asn: number | null;
  organization: string | null;
  network: string | null;          // CIDR notation
  traits: IpTraits | null;         // VPN, proxy, Tor, etc.
}
```

## Advanced Usage

For enterprise features — custom databases, custom data overlay, cache tuning:

```ts
import { GeoIP } from "mr-geopip";

const geo = GeoIP.create({
  dataDir: "./my-paid-maxmind-dbs",   // your DBs merged over bundled
  cache: { maxSize: 50_000, ttlMs: 300_000 },
  customStore: { filePath: "./custom-ips.json" },
});

const info = geo.lookup("8.8.8.8");
```

> **Note:** `GeoIP.create()` is also synchronous — no `await` needed.

### Configuration

```ts
interface GeoIPConfig {
  /** Your own MMDB files — merged over bundled (user data prioritized). */
  dataDir?: string;
  cityDbFile?: string;    // default: "GeoLite2-City.mmdb"
  asnDbFile?: string;     // default: "GeoLite2-ASN.mmdb"
  /** LRU cache config. Pass `false` to disable. */
  cache?: { maxSize?: number; ttlMs?: number } | false;
  /** JSON-backed custom data persistence. */
  customStore?: { filePath: string; flushIntervalMs?: number };
}
```

## Custom Data Overlay

Attach your own metadata to any IP. Custom data overrides MMDB values on lookup:

```ts
const geo = GeoIP.create({
  customStore: { filePath: "./custom-ips.json" },
});

// Attach custom data (persisted to disk as JSON)
await geo.setCustomData("10.0.0.1", {
  country: "Internal",
  organization: "HQ",
  city: "Private Cloud",
});

const info = geo.lookup("10.0.0.1");
console.log(info.organization); // "HQ"

// Bulk set
await geo.setCustomDataBulk([
  { ip: "10.0.0.2", data: { organization: "Branch A" } },
  { ip: "10.0.0.3", data: { organization: "Branch B" } },
]);

// Remove
await geo.removeCustomData("10.0.0.1");
```

## User Database Merge

When you provide your own MMDB databases (e.g. paid MaxMind GeoIP2), the library merges results:

1. **Your DB** is queried first (higher accuracy)
2. **Bundled DB** fills in any `null` gaps (free GeoLite2 fallback)
3. **Custom data** overlays on top (highest priority)

```ts
const geo = GeoIP.create({
  dataDir: "./my-paid-dbs", // your GeoIP2 databases
});

// Result uses your paid DB data, with bundled DB as fallback
const info = geo.lookup("8.8.8.8");
```

## Cache Management

```ts
const geo = GeoIP.create({
  cache: { maxSize: 50_000, ttlMs: 600_000 }, // 50K entries, 10min TTL
});

// Stats
const stats = geo.cacheStats();
console.log(stats); // { hits, misses, hitRate, size, maxSize }

// Clear
geo.clearCache();

// Disable entirely
const geo2 = GeoIP.create({ cache: false });
```

## Hot Reload

After updating databases, reload without restarting:

```ts
geo.reload(); // synchronous — re-reads MMDB files, clears cache
```

## Database Updates

### Programmatic

```ts
import { updateDb } from "mr-geopip";

await updateDb({ outputDir: "./data" });
```

### CLI

```bash
bun run update:ipdb

# Options
bun run update:ipdb --months=18 --output-dir=data
bun run update:ipdb --city-url=https://example.com/city.mmdb --asn-url=https://example.com/asn.mmdb
bun run update:ipdb --dry-run
```

## Lifecycle

```ts
// Graceful shutdown — flushes custom data store, clears cache
await geo.close();
```

## IP Validation

Standalone validation utilities (re-exported for convenience):

```ts
import { isValidIP, isValidIPv4, isValidIPv6 } from "mr-geopip";

isValidIP("8.8.8.8");          // true
isValidIPv4("192.168.1.1");    // true
isValidIPv6("::1");            // true
isValidIP("not-an-ip");       // false
```

## Error Handling

All errors extend `GeoIPError` for easy catch-all handling:

```ts
import { InvalidIPError, DatabaseNotFoundError, GeoIPError } from "mr-geopip";

try {
  lookup("bad-ip");
} catch (err) {
  if (err instanceof InvalidIPError) {
    console.log(err.ip); // "bad-ip"
  }
  if (err instanceof GeoIPError) {
    // Any mr-geopip error
  }
}
```

## vs geoip-lite

| Feature | geoip-lite | mr-geopip |
|:---|:---|:---|
| One-liner `lookup(ip)` | ✅ | ✅ |
| Synchronous | ✅ | ✅ |
| DB bundled | ✅ | ✅ |
| TypeScript | ❌ | ✅ Native |
| ESM + CJS | ❌ CJS only | ✅ |
| Runtime-agnostic | ❌ Node only | ✅ Node/Bun/Deno |
| ASN / Organization | ❌ | ✅ |
| Network CIDR | ❌ | ✅ |
| IP Traits (VPN, Proxy, Tor) | ❌ | ✅ |
| LRU Cache + stats | ❌ | ✅ |
| Custom data overlay | ❌ | ✅ |
| User DB merge | ❌ | ✅ |
| Hot reload | ❌ | ✅ |
| Structured errors | ❌ | ✅ |

## License

MIT
