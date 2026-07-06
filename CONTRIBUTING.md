# Contributing to mr-geoip

First off, thank you for considering contributing to `mr-geoip`! It's people like you who make open source a great place.

---

## Development Setup

`mr-geoip` uses **Bun** as its primary package manager and runtime during development, but the package compiles to run on any Node.js ≥ 18 environment.

### Prerequisites
- Install [Bun](https://bun.sh) (version ≥ 1.0)
- Install Git

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/mr-geoip.git
   cd mr-geoip
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Download the GeoIP database files for local development:
   ```bash
   bun run update:ipdb
   ```

---

## Workflows

### Building the Project
We use `tsup` to bundle the package into dual-format ESM (`.js`) and CommonJS (`.cjs`) distributions, along with their TypeScript types:
```bash
bun run build
```

### Running Tests
Tests are implemented using `vitest` and cover the cache layers, API routing, fallbacks, and updaters:
```bash
# Run tests once
bun run test

# Run tests in watch mode during development
bun run test:watch
```

---

## Coding Style & Standards

- **TypeScript First**: All logic must be strictly typed. Avoid `any` except inside mocks or test helper routines.
- **Error Handling**: Custom error classes must extend the base `GeoIPError` class.
- **Graceful Shutdowns**: Always ensure any scheduled intervals (like the database auto-updater) or open files can be cleanly released/cleared via the `GeoIP.close()` method.
- **No Large Assets**: Never check database files (`.mmdb`) or large binary assets into git. Keep them excluded in `.gitignore`.

---

## Submitting Pull Requests

1. Create a branch for your feature or fix:
   ```bash
   git checkout -b feature/my-cool-feature
   ```
2. Commit your changes with descriptive messages.
3. Make sure all tests are passing:
   ```bash
   bun run test
   ```
4. Build the project to confirm there are no compiler warnings or errors:
   ```bash
   bun run build
   ```
5. Push to your fork and submit a Pull Request!
