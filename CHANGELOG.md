# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.3] - 2026-07-07

### Changed
- **Bundled Databases**: GeoLite2 City & ASN databases (~78 MB) now ship directly inside the npm package. No postinstall download required — lookups work offline immediately after `npm install`.
- **CLI Default Path**: `npx mr-geoip-update` now correctly writes to the package's bundled `data/` directory (`node_modules/mr-geoip/data/`) instead of creating a `data/` folder in the consumer's project root.

### Fixed
- **TypeScript 6 Build**: Fixed DTS generation failure caused by tsup 8.5.1 injecting the deprecated `baseUrl` compiler option. Declarations are now generated via `tsc` directly.
- **tsconfig.json**: Removed unused `allowImportingTsExtensions`, replaced `noEmit` with `emitDeclarationOnly` + `declaration` to support direct `tsc` declaration output.

### Updated
- **README.md**: Rewrote with exports table, CLI options table, programmatic `updateDb()` usage, and accurate package size claims.
- **DOCUMENTATION.md**: Added programmatic database update section, auto-update config, IP validation utilities, custom data helpers, error classes table, and CLI examples.

---

## [0.1.2] - 2026-07-07

This is the initial production-ready release of `mr-geoip`, featuring a lightweight packaging footprint, safe no-throw API layers, custom data storage, concurrency-safe locking, and auto-updating support.

### Added
- **Lightweight Delivery**: Excluded the 78MB binary MaxMind databases from the npm package to achieve a publish size of **163.4KB** (perfect for serverless/edge functions).
- **Silent Postinstall Downloader**: Automatically downloads database files on install, failing gracefully/silently if the user is offline or pnpm blocks scripts.
- **CLI Tooling**: Added `npx mr-geoip-update` to easily download and refresh database files manually or programmatically.
- **HTTP Fallback Chain**: Implemented prioritizing `ipapi.co` first, falling back to `FreeIPAPI.com` if rate-limited or offline.
- **Safe Geolocation APIs**: Added `lookupSafe` and `lookupSafeAsync` one-liners that return `null` instead of throwing errors or returning empty structures for invalid/unmapped IPs.
- **Custom Response Mapper**: Added the `mapResult` function option to `FallbackApiConfig` to map any custom JSON schemas into the standard `IpDetails` properties.
- **Custom HTTP Headers**: Added the `headers` option to `FallbackApiConfig` to support passing API keys/authorization headers to custom geo-lookup APIs.
- **Cache Conditioning**: Implemented intelligent cache management that avoids caching empty results when local databases are missing.
- **Advisory File Locking**: Implemented atomic directory locks for custom database JSON persistence to ensure concurrency safety.
- **MIT License**: Included standard LICENSE file.
- **Contribution Guide**: Included CONTRIBUTING.md.
- **Detailed Documentation**: Included documentation.md.
