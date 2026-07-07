# mr-geoip — Developer Documentation

Complete reference for configuring, extending, and using `mr-geoip` in production.

---

## Table of Contents

1. [Core Lookup APIs](#1-core-lookup-apis)
2. [HTTP API Fallback Chain](#2-http-api-fallback-chain)
3. [Safe Lookup APIs](#3-safe-lookup-apis)
4. [Custom MaxMind Databases](#4-custom-maxmind-databases)
5. [Custom Data Overlays](#5-custom-data-overlays)
6. [Database Management & CLI](#6-database-management--cli)
7. [Programmatic Database Updates](#7-programmatic-database-updates)
8. [API Reference & Interfaces](#8-api-reference--interfaces)
9. [Third-Party APIs: Legal & Rate Limits](#9-third-party-apis-legal--rate-limits)

---

## 1. Core Lookup APIs

`mr-geoip` ships with GeoLite2 City & ASN databases bundled in the package. Lookups work offline with zero configuration.

### Synchronous Lookup

`lookup(ip)` reads from MMDB databases loaded into memory. It is **synchronous** and cannot fall back to HTTP APIs.

```typescript
import { lookup } from "mr-geoip";

const details = lookup("8.8.8.8");
console.log(details.country);     // "United States"
console.log(details.countryCode); // "US"
console.log(details.city);        // "Mountain View"
console.log(details.asn);         // 15169
console.log(details.organization); // "GOOGLE"
console.log(details.timezone);    // "America/Los_Angeles"
```

> [!IMPORTANT]
> If the bundled databases are missing, `lookup(ip)` returns an `IpDetails` object with all nullable fields set to `null`. It does **not** throw — use `lookupSafe` if you want `null` instead.

### Asynchronous Lookup

`lookupAsync(ip)` tries local databases first, then falls back to the HTTP API chain if unavailable.

```typescript
import { lookupAsync } from "mr-geoip";

const details = await lookupAsync("8.8.8.8");
console.log(details.country); // "United States"
```

---

## 2. HTTP API Fallback Chain

When local databases are unavailable (e.g. in edge/serverless deployments), `lookupAsync` uses a multi-tier HTTP fallback:

### Default Priority

1. **ipapi.co** — `https://ipapi.co/{ip}/json/`
2. **FreeIPAPI.com** — `https://freeipapi.com/api/json/{ip}`

### Custom Fallback Configuration

```typescript
import { GeoIP, type IpDetails } from "mr-geoip";

const geo = GeoIP.create({
  fallbackApi: {
    enabled: true,
    timeoutMs: 2500,
    urlTemplate: "https://my-api.com/lookup/{ip}",
    headers: {
      "Authorization": "Bearer my-token",
    },
    // Map your API's response to IpDetails
    mapResult: (body: any): Partial<IpDetails> => ({
      country: body.location.country_name,
      countryCode: body.location.iso_code,
      city: body.location.city_name,
      timezone: body.location.time_zone,
    }),
  },
});
```

---

## 3. Safe Lookup APIs

`lookupSafe` and `lookupSafeAsync` return `null` instead of throwing `InvalidIPError` or returning empty shells for invalid/private IPs:

```typescript
import { lookupSafe, lookupSafeAsync } from "mr-geoip";

lookupSafe("not-an-ip");         // null (invalid IP)
lookupSafe("127.0.0.1");         // null (private/loopback)
lookupSafe("8.8.8.8");           // IpDetails

await lookupSafeAsync("8.8.8.8"); // IpDetails (with fallback)
```

---

## 4. Custom MaxMind Databases

If you have paid MaxMind databases (GeoIP2 City/ASN) or custom MMDB files, merge them with the bundled databases:

```typescript
import { GeoIP } from "mr-geoip";

const geo = GeoIP.create({
  dataDir: "/path/to/custom/db/folder",
  cityDbFile: "GeoIP2-City.mmdb",
  asnDbFile: "GeoIP2-ASN.mmdb",
});

const details = geo.lookup("8.8.8.8");
```

**Prioritization**: Your custom databases are checked first. Missing fields fall back to the bundled GeoLite2 databases.

---

## 5. Custom Data Overlays

Override IP metadata for internal networks, VPNs, or office IPs. These overlay on top of MMDB results.

### Adding Custom Entries

```typescript
import { GeoIP, createCustomIpData } from "mr-geoip";

const geo = GeoIP.create({
  customStore: { filePath: "./data/custom-ips.json" },
});

const officeEntry = createCustomIpData("192.168.1.100", {
  country: "India",
  countryCode: "IN",
  city: "Bangalore",
  organization: "HQ Office",
});

await geo.setCustomData(officeEntry);
```

### Concurrency Safety

Multiple workers writing to the same custom data file are handled with advisory file locking — updates wait and retry automatically to prevent data corruption.

---

## 6. Database Management & CLI

### Bundled Databases

`mr-geoip` ships with the free GeoLite2 City and ASN databases included in the package. They work out of the box — no download step required.

### Updating Databases via CLI

To refresh the bundled databases to the latest release:

```bash
npx mr-geoip-update
```

This downloads the latest databases directly into the package's `data/` directory inside `node_modules/mr-geoip/`.

### CLI Options

| Flag | Description | Default |
|---|---|---|
| `--output-dir=<path>` | Download to a custom directory | Package's bundled `data/` folder |
| `--city-url=<url>` | Custom City database URL | GitHub mirror |
| `--asn-url=<url>` | Custom ASN database URL | GitHub mirror |
| `--dry-run` | Check connections without downloading | `false` |

### Examples

```bash
# Update bundled databases
npx mr-geoip-update

# Save to a custom folder
npx mr-geoip-update --output-dir=./my-data

# Use a custom mirror or private MaxMind URL
npx mr-geoip-update --city-url="https://example.com/City.mmdb" --asn-url="https://example.com/ASN.mmdb"

# Dry run — verify connectivity without downloading
npx mr-geoip-update --dry-run
```

### Skipping Postinstall

The package includes a postinstall script that checks for the databases. To skip it entirely:

```bash
MR_GEOPIP_SKIP_DOWNLOAD=true npm install
```

---

## 7. Programmatic Database Updates

You can update databases from code using `updateDb()`:

```typescript
import { updateDb } from "mr-geoip";

// Update bundled databases (inside node_modules/mr-geoip/data/)
await updateDb();

// Download to a custom directory
await updateDb({ outputDir: "./my-data" });

// Use custom URLs
await updateDb({
  cityUrl: "https://example.com/GeoIP2-City.mmdb",
  asnUrl: "https://example.com/GeoIP2-ASN.mmdb",
});

// Dry run
await updateDb({ dryRun: true });
```

### `UpdateConfig`

```typescript
interface UpdateConfig {
  outputDir?: string;       // Default: package's bundled data/ directory
  dryRun?: boolean;         // Default: false
  lookbackMonths?: number;  // Number of monthly snapshots to try
  cityUrl?: string;         // Custom City DB URL
  asnUrl?: string;          // Custom ASN DB URL
}
```

### Auto-Update (Background Refresh)

Schedule automatic database refreshes using the `GeoIP` class:

```typescript
import { GeoIP } from "mr-geoip";

const geo = GeoIP.create({
  autoUpdate: {
    intervalMs: 86_400_000, // Every 24 hours
    onUpdate: () => console.log("Databases refreshed!"),
    onError: (err) => console.error("Update failed:", err),
  },
});
```

---

## 8. API Reference & Interfaces

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

### IP Validation Utilities

```typescript
import { isValidIP, isValidIPv4, isValidIPv6 } from "mr-geoip";

isValidIP("8.8.8.8");               // true
isValidIP("2001:4860:4860::8888");  // true
isValidIPv4("8.8.8.8");             // true
isValidIPv6("::1");                  // true
isValidIP("not-an-ip");             // false
```

### Custom Data Helpers

```typescript
import { createCustomIpData, createCustomIpDataSet } from "mr-geoip";

// Single entry
const entry = createCustomIpData("10.0.0.1", {
  country: "Internal",
  organization: "Dev Team",
});

// Batch creation
const entries = createCustomIpDataSet([
  { ip: "10.0.0.1", data: { country: "Internal" } },
  { ip: "10.0.0.2", data: { country: "Internal" } },
]);
```

### Error Classes

| Error | When |
|---|---|
| `InvalidIPError` | Invalid IP passed to `lookup` / `lookupAsync` |
| `DatabaseNotFoundError` | MMDB file not found at expected path |
| `DatabaseReadError` | MMDB file exists but cannot be parsed |
| `CustomStoreNotConfiguredError` | `setCustomData` called without `customStore` config |
| `GeoIPNotInitializedError` | Internal singleton not initialized |

---

## 9. Third-Party APIs: Legal & Rate Limits

The async fallback chain queries third-party endpoints. Here's what to know:

### Terms of Service

- Only the requested IP address is sent to fallback endpoints — no telemetry or personal data.
- Usage is subject to the terms of `ipapi.co` and `freeipapi.com`.

### Rate Limits

| Service | Limit | Tier |
|---|---|---|
| **ipapi.co** | 1,000 requests/day | Primary |
| **FreeIPAPI.com** | 60 requests/minute | Secondary |

### Production Recommendations

1. **Use the bundled local databases** — zero network requests, zero latency, unlimited lookups.
2. **Run `npx mr-geoip-update`** periodically to keep databases current.
3. **Configure a paid API** if you need HTTP fallback at scale:

```typescript
const geo = GeoIP.create({
  fallbackApi: {
    enabled: true,
    urlTemplate: "https://ipapi.co/{ip}/json/?key=YOUR_API_KEY",
  },
});
```
