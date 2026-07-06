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
- **Serverless Ready** — lightweight NPM shipment (only 163.4KB), making it fully compatible with Vercel and AWS Lambda limits.
- **TypeScript first** — full native type safety out of the box
- **HTTP Fallback** — automatically falls back to public APIs if local database files are missing or skipped.

---

## Install

```bash
npm install mr-geoip
# or
bun add mr-geoip
```

---

## Quick Start

### 1. Synchronous Lookup (uses local databases)
>
> [!IMPORTANT]
> `lookup` is synchronous. Since JS runtimes do not support synchronous network requests, it **cannot** fall back to HTTP APIs if the local databases are missing. It returns `null` or empty fields.

```typescript
import { lookup } from "mr-geoip";

const details = lookup("8.8.8.8");
console.log(details.country); // "United States"
console.log(details.asn);     // 15169
```

### 2. Asynchronous Lookup (with HTTP Fallback)

If the local databases are not downloaded or skipped during installation, `lookupAsync` automatically falls back to online APIs (`ipapi.co` $\rightarrow$ `FreeIPAPI.com`) and caches the result for future lookups.

```typescript
import { lookupAsync } from "mr-geoip";

const details = await lookupAsync("8.8.8.8");
console.log(details.country); // "United States"
```

> [!NOTE]
> The async fallback endpoints (`ipapi.co` and `freeipapi.com`) are public third-party services. Usage is subject to their rate limits (e.g. 1,000 requests/day for `ipapi.co`). For high-volume production, we recommend using local databases or configuring your own paid API key. See [DOCUMENTATION.md](file:///d:/development/mr-geopip/DOCUMENTATION.md#8-third-party-apis-legal-rate-limits) for details.

### 3. Safe Geolocation (No-Throw APIs)

Returns `null` instead of throwing `InvalidIPError` or returning unpopulated details for unmapped/private ranges (like loopbacks):

```typescript
import { lookupSafe, lookupSafeAsync } from "mr-geoip";

const bad = lookupSafe("invalid-ip"); // null
const local = lookupSafe("127.0.0.1"); // null
const details = await lookupSafeAsync("8.8.8.8");
```

---

## Offline Databases & CLI

By default, `mr-geoip` downloads the free GeoLite2 City and ASN databases automatically during installation so that your lookups run 100% offline at sub-millisecond speeds.

Using the offline database **completely avoids the rate limits** associated with public HTTP lookup fallbacks (which are restricted to 1,000 requests/day).

### Downloading & Updating the Offline Databases
If the postinstall download was skipped (e.g. in firewalled or CI environments using the `MR_GEOPIP_SKIP_DOWNLOAD=true` flag), or if you want to update to the latest database release, run the following CLI command:

```bash
npx mr-geoip-update
```

### CLI Command Options
Customize the update behavior with arguments:

```bash
# Save databases to a custom folder instead of the default package bundle location
npx mr-geoip-update --output-dir=./custom-data-dir

# Fetch databases from a custom mirror or private MaxMind URL
npx mr-geoip-update --city-url="<city-db-url>" --asn-url="<asn-db-url>"

# Verify connection and configuration without downloading files
npx mr-geoip-update --dry-run
```

---

## Detailed Documentation

For advanced setup, check out the full [DOCUMENTATION.md](file:///d:/development/mr-geopip/DOCUMENTATION.md) file:
- **Custom MaxMind databases** — how to supply your own databases and merge them.
- **Custom Data Overlays** — override IP metadata (e.g. for internal offices/VPNs) with advisory concurrency file locks.
- **Database Updates & CLI** — how to download database files manually or programmatically when skipping postinstall.
- **API Reference** — complete type interfaces and descriptions.

---

## License

MIT
