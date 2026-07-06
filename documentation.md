# mr-geoip Developer Documentation

Welcome to the detailed developer documentation for `mr-geoip`. This document covers every aspect of configuring, extending, and utilizing `mr-geoip` in production environments.

---

## Table of Contents
1. [Core Lookup APIs](#1-core-lookup-apis)
2. [HTTP API Fallback Chain](#2-http-api-fallback-chain)
3. [Safe Geolocation APIs](#3-safe-geolocation-apis)
4. [Custom MaxMind Databases](#4-custom-maxmind-databases)
5. [Custom Data Overlays](#5-custom-data-overlays)
6. [Database Management & CLI Updaters](#6-database-management--cli-updaters)
7. [API Reference & Interfaces](#7-api-reference--interfaces)

---

## 1. Core Lookup APIs

`mr-geoip` exports both a simple, zero-config one-liner API and an advanced configurable class.

### The Synchronous Lookup
`lookup(ip)` executes synchronously. It reads the local MMDB databases loaded into memory.
> [!IMPORTANT]
> Because JavaScript runtimes do not support synchronous network requests, `lookup(ip)` **cannot** query the HTTP fallback APIs. If the local databases are not present on disk, `lookup(ip)` will return empty geolocation details where all nullable fields are `null`.

```typescript
import { lookup } from "mr-geoip";

const details = lookup("8.8.8.8");
console.log(details.country); // "United States"
console.log(details.asn);     // 15169
```

### The Asynchronous Lookup
`lookupAsync(ip)` executes asynchronously. It first queries local databases. If databases are missing or empty, it queries the fallback HTTP API chain.
```typescript
import { lookupAsync } from "mr-geoip";

const details = await lookupAsync("8.8.8.8");
console.log(details.country); // "United States"
```

---

## 2. HTTP API Fallback Chain

If you do not ship database files with your application (e.g., in serverless edge deployments to Vercel/Netlify), the library automatically uses a multi-tier HTTP fallback chain.

### Priority Routing
By default, the chain resolves in this order:
1. **ipapi.co** (`https://ipapi.co/{ip}/json/`) - Prioritized first.
2. **FreeIPAPI.com** (`https://freeipapi.com/api/json/{ip}`) - Secondary fallback.

### Configuring Fallbacks
You can customize timeouts, pass authentication headers (e.g. for enterprise API keys), and supply a custom response mapper function:
```typescript
import { GeoIP, type IpDetails } from "mr-geoip";

const geo = GeoIP.create({
  fallbackApi: {
    enabled: true,
    timeoutMs: 2500, // Timeout after 2.5s per request
    urlTemplate: "https://my-enterprise-geo-api.com/lookup/{ip}",
    // Custom HTTP headers
    headers: {
      "Authorization": "Bearer my-secret-token",
      "x-api-key": "enterprise-key"
    },
    // Custom mapper function to translate your API's JSON response
    mapResult: (body: any): Partial<IpDetails> => ({
      country: body.location.country_name,
      countryCode: body.location.iso_code,
      city: body.location.city_name,
      timezone: body.location.time_zone
    })
  }
});
```

---

## 3. Safe Geolocation APIs

If you pass an invalid IP to `lookup()` or `lookupAsync()`, it throws an `InvalidIPError`.
If you want to prevent try-catch blocks, use the safe APIs, which return `null` if the IP is invalid or cannot be resolved (like unmapped loopback/local ranges):

```typescript
import { lookupSafe, lookupSafeAsync } from "mr-geoip";

// Returns null instead of throwing:
const invalid = lookupSafe("not-an-ip"); // null

// Returns null instead of empty geolocation shell for private IP:
const privateIp = lookupSafe("127.0.0.1"); // null

// Async safe version (supports fallback):
const result = await lookupSafeAsync("8.8.8.8");
```

---

## 4. Custom MaxMind Databases

If you purchase paid MaxMind databases (like GeoIP2 City/ASN) or prefer hosting databases in a custom folder, you can merge them into `mr-geoip`:

```typescript
import { GeoIP } from "mr-geoip";

const geo = GeoIP.create({
  dataDir: "/path/to/custom/db/folder",
  cityDbFile: "MyGeoIP2-City.mmdb",
  asnDbFile: "MyGeoIP2-ASN.mmdb"
});
```
* **Prioritization**: Lookups check your custom DBs first. If a field is missing, it falls back to the bundled Free GeoLite2 databases.

---

## 5. Custom Data Overlays

You can define custom IP overrides (like internal VPN networks, offices, or branch offices). This data overlays on top of the MMDB outputs.

### Adding Custom Entries
Use the `createCustomIpData` helper to validate structures at runtime, and write to a JSON-backed database file:
```typescript
import { GeoIP, createCustomIpData } from "mr-geoip";

const geo = GeoIP.create({
  customStore: { filePath: "./data/custom-ips.json" }
});

const officeEntry = createCustomIpData("192.168.1.100", {
  country: "India",
  countryCode: "IN",
  city: "Bangalore",
  organization: "HQ Office"
});

await geo.setCustomData(officeEntry);
```

### Advisory File Locking (Concurrency Safety)
If you have multiple background workers or API servers writing to the same custom data file concurrently, `mr-geoip` uses a runtime-agnostic advisory locking mechanism. If the file is locked, updates wait and retry automatically, ensuring zero data corruption or file truncations.

---

## 6. Database Management & CLI Updaters

### Skip Post-Install Downloads
During installation, `mr-geoip` attempts to auto-download databases. If your installation runs in a firewalled environment or pnpm blocks scripts, the installer fails gracefully (exit 0). You can skip post-install downloads entirely using:
```bash
MR_GEOPIP_SKIP_DOWNLOAD=true npm install
```

### Manual/CLI Database Update
You can fetch or refresh database files manually at any time using:
```bash
npx mr-geoip-update
```
Options supported:
* `--output-dir=<path>`: Destination directory (default is package bundle's `data` folder).
* `--city-url=<url>` / `--asn-url=<url>`: Custom MaxMind URL/mirror endpoints.
* `--dry-run`: Checks connections without saving files.

---

## 7. API Reference & Interfaces

### `IpDetails`
The shape returned by all lookup methods:
```typescript
interface IpDetails {
  ip: string;
  country: string | null;
  countryCode: string | null;
  subdivision: string | null;
  subdivisionCode: string | null;
  continent: string | null;
  continentCode: string | null;
  city: string | null;
  postalCode: string | null;
  euMember: boolean;
  timezone: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  asn: number | null;
  organization: string | null;
  network: string | null;
  traits?: IpTraits;
}
```

---

## 8. Third-Party APIs: Legal & Rate Limits

By default, the asynchronous fallback chain queries third-party public API endpoints (`ipapi.co` and `freeipapi.com`). Here is what you need to know:

### Terms of Service & Compliance
- **Compliance**: Using these fallback endpoints is completely legal and standard practice. However, `mr-geoip` does not own or maintain these services. Your usage is subject to the terms and privacy policies of `ipapi.co` and `freeipapi.com`.
- **Private Data**: Only the requested IP address is transmitted to these endpoints during fallbacks. No other telemetry or personal info is sent.

### Rate Limits
- **ipapi.co (Tier 1)**: Limited to **1,000 requests per day** per IP address on the free tier. If you exceed this, the API returns a `429 Too Many Requests` error, and `mr-geoip` will automatically fall back to Tier 2.
- **FreeIPAPI (Tier 2)**: Limited to **60 requests per minute** per IP address. Allows commercial use on the free tier.

### Production Recommendations
To ensure reliability and compliance in high-volume production environments:
1. **Always Use Local Databases**: Ensure `postinstall` is enabled or run `npx mr-geoip-update` as part of your deployment build. Local MMDB lookups are offline, require zero network requests, have zero latency, and support unlimited requests.
2. **Use a Custom API URL**: If you want to use a paid tier of `ipapi.co` (with an API key) or host your own geo-lookup microservice, configure a custom `urlTemplate`:
   ```typescript
   const geo = GeoIP.create({
     fallbackApi: {
       enabled: true,
       urlTemplate: "https://ipapi.co/{ip}/json/?key=YOUR_API_KEY"
     }
   });
   ```

