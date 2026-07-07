<p align="center">
  <a href="https://github.com/rohittiwari-dev/mr-geoip">
    <img src="https://raw.githubusercontent.com/rohittiwari-dev/mr-geoip/main/assests/banner.png" alt="mr-geoip logo" width="1024" />
  </a>
</p>
# mr-geoip

Production-grade, runtime-agnostic IP geolocation — one-liner API with batteries included.

- **One-liner** — `lookup("8.8.8.8")` — no init, no config
- **Fast** — sub-millisecond in-memory lookups with configurable LRU cache
- **Runtime-agnostic** — works on Node.js ≥ 18, Bun, and Deno
- **Batteries included** — GeoLite2 City & ASN databases ship with the package (~78 MB), zero setup needed
- **TypeScript first** — full native type safety out of the box
- **HTTP Fallback** — automatically falls back to public APIs if local databases are unavailable

---

## Install

```bash
npm install mr-geoip
# or
bun add mr-geoip
```

> [!NOTE]
> `mr-geoip` ships with the free **GeoLite2 City & ASN** databases bundled in the package — lookups work offline out of the box with zero setup. To update to the latest database release, run:
>
> ```bash
> npx mr-geoip-update
> ```

---

## Quick Start

### 1. Synchronous Lookup

```typescript
import { lookup } from "mr-geoip";

const details = lookup("8.8.8.8");
console.log(details.country); // "United States"
console.log(details.city);    // "Mountain View"
console.log(details.asn);     // 15169
```

> [!IMPORTANT]
> `lookup` is synchronous — it reads from the bundled MMDB databases in memory. It **cannot** fall back to HTTP APIs. If databases are missing, nullable fields return `null`.

### 2. Asynchronous Lookup (with HTTP Fallback)

If local databases are unavailable, `lookupAsync` automatically falls back to online APIs (`ipapi.co` → `FreeIPAPI.com`) and caches the result.

```typescript
import { lookupAsync } from "mr-geoip";

const details = await lookupAsync("8.8.8.8");
console.log(details.country); // "United States"
```

> [!NOTE]
> The fallback endpoints are public third-party services with rate limits (e.g. 1,000 req/day for `ipapi.co`). For production, use the bundled local databases. See [DOCUMENTATION.md](./DOCUMENTATION.md#8-third-party-apis-legal--rate-limits) for details.

### 3. Safe Lookup (No-Throw)

Returns `null` instead of throwing for invalid/private IPs:

```typescript
import { lookupSafe, lookupSafeAsync } from "mr-geoip";

lookupSafe("invalid-ip");      // null
lookupSafe("127.0.0.1");       // null
await lookupSafeAsync("8.8.8.8"); // IpDetails
```

---

## What's Exported

| Export | Type | Description |
|---|---|---|
| `lookup(ip)` | Function | Synchronous IP lookup (local databases only) |
| `lookupAsync(ip)` | Function | Async IP lookup with HTTP fallback |
| `lookupSafe(ip)` | Function | `lookup` but returns `null` on error |
| `lookupSafeAsync(ip)` | Function | `lookupAsync` but returns `null` on error |
| `GeoIP` | Class | Advanced API — custom databases, caching, overlays, auto-update |
| `updateDb(config?)` | Function | Programmatically download/update MMDB databases |
| `isValidIP(ip)` | Function | Validate an IP string (v4/v6) |
| `isValidIPv4(ip)` | Function | Validate an IPv4 string |
| `isValidIPv6(ip)` | Function | Validate an IPv6 string |
| `createCustomIpData(ip, data)` | Function | Create a validated custom IP override entry |
| `IpDetails` | Type | Full geolocation result shape |
| `GeoIPConfig` | Type | Configuration for `GeoIP.create()` |
| `UpdateConfig` | Type | Configuration for `updateDb()` |

---

## CLI — Database Updates

The bundled databases can be refreshed anytime using the CLI:

```bash
npx mr-geoip-update
```

### Options

| Flag | Description |
|---|---|
| `--output-dir=<path>` | Download to a custom directory (default: package's bundled `data/` folder) |
| `--city-url=<url>` | Custom URL for the City database |
| `--asn-url=<url>` | Custom URL for the ASN database |
| `--dry-run` | Check connection without downloading files |

### Programmatic Update

```typescript
import { updateDb } from "mr-geoip";

// Update bundled databases
await updateDb();

// Update to a custom directory
await updateDb({ outputDir: "./my-data" });
```

---

## Advanced Usage

For advanced configuration, see [DOCUMENTATION.md](./DOCUMENTATION.md):
- **Custom MaxMind databases** — supply your own paid databases and merge with bundled ones
- **Custom Data Overlays** — override IP metadata for internal networks/VPNs
- **HTTP Fallback Config** — custom API endpoints, headers, and response mappers
- **Auto-Update** — schedule automatic database refreshes
- **API Reference** — complete type interfaces

---

## License

MIT
