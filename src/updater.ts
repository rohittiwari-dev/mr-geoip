import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { UpdateConfig } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DBIP_FREE_BASE_URL =
  "https://github.com/P3TERX/GeoLite.mmdb/raw/download";
const DEFAULT_LOOKBACK_MONTHS = 12;

// ---------------------------------------------------------------------------
// Dataset descriptor
// ---------------------------------------------------------------------------

interface Dataset {
  id: "city" | "asn";
  fileName: string;
  label: string;
  buildUrl: (month: string) => string;
}

const DATASETS: ReadonlyArray<{
  dataset: Dataset;
  configKey: "cityUrl" | "asnUrl";
}> = [
  {
    dataset: {
      id: "city",
      label: "GeoIP City Lite",
      fileName: "GeoLite2-City.mmdb",
      buildUrl: () => `${DBIP_FREE_BASE_URL}/GeoLite2-City.mmdb`,
    },
    configKey: "cityUrl",
  },
  {
    dataset: {
      id: "asn",
      label: "GeoIP ASN Lite",
      fileName: "GeoLite2-ASN.mmdb",
      buildUrl: () => `${DBIP_FREE_BASE_URL}/GeoLite2-ASN.mmdb`,
    },
    configKey: "asnUrl",
  },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthCandidates(lookbackMonths: number): string[] {
  const current = new Date();
  const result: string[] = [];

  for (let i = 0; i < lookbackMonths; i += 1) {
    const d = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - i, 1),
    );
    result.push(formatMonth(d));
  }

  return result;
}

async function extractBody(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  if (url.endsWith(".gz")) {
    return gunzipSync(compressed);
  }
  return compressed;
}

async function writeAtomic(targetPath: string, data: Buffer): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp`;
  await writeFile(tempPath, data);
  await rename(tempPath, targetPath);
}

async function cleanupTemp(targetPath: string): Promise<void> {
  const tempPath = `${targetPath}.tmp`;
  try {
    await unlink(tempPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function downloadDataset(
  dataset: Dataset,
  outputDir: string,
  urls: string[],
  dryRun: boolean,
): Promise<void> {
  const targetPath = join(outputDir, dataset.fileName);
  console.log(`\n[${dataset.label}] target: ${targetPath}`);

  if (dryRun) {
    for (const url of urls) {
      console.log(`  - ${url}`);
    }
    return;
  }

  const failures: string[] = [];

  for (const url of urls) {
    process.stdout.write(`  Trying ${url} ... `);
    try {
      const data = await extractBody(url);

      if (data.length < 1024) {
        throw new Error(`Downloaded payload too small (${data.length} bytes)`);
      }

      await writeAtomic(targetPath, data);
      console.log(`OK (${data.length.toLocaleString()} bytes)`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${url} -> ${message}`);
      console.log("failed");
      await cleanupTemp(targetPath);
    }
  }

  throw new Error(
    `Could not update ${dataset.label}. Attempted URLs:\n${failures.map((line) => `- ${line}`).join("\n")}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Download the latest free GeoLite2 MMDB databases.
 *
 * Can be called programmatically from your code or via the CLI script:
 * ```bash
 * bun run scripts/update-ip-dbs.ts
 * ```
 *
 * @example
 * ```ts
 * import { updateDb } from "mr-geopip";
 *
 * await updateDb({ outputDir: "./data" });
 * ```
 */
export async function updateDb(config: UpdateConfig = {}): Promise<void> {
  const outputDir = config.outputDir ?? "data";
  const lookbackMonths = config.lookbackMonths ?? DEFAULT_LOOKBACK_MONTHS;
  const dryRun = config.dryRun ?? false;

  const months = monthCandidates(lookbackMonths);

  console.log(`Updating free IP databases into "${outputDir}"`);
  console.log(`Lookback window: ${lookbackMonths} month(s)`);
  if (dryRun) {
    console.log("Dry run mode: no files will be written.");
  }

  for (const item of DATASETS) {
    const overrideUrl = config[item.configKey];
    const urls = overrideUrl
      ? [overrideUrl]
      : months.map(item.dataset.buildUrl);
    await downloadDataset(item.dataset, outputDir, urls, dryRun);
  }

  if (!dryRun) {
    const timestamp = new Date().toISOString();
    const metadataPath = join(outputDir, "geoip-last-update.json");
    const metadata = {
      updatedAt: timestamp,
      provider: "GeoIP Lite (free)",
      files: DATASETS.map((item) => item.dataset.fileName),
    };
    await writeAtomic(
      metadataPath,
      Buffer.from(JSON.stringify(metadata, null, 2), "utf8"),
    );
  }

  console.log("\nDone.");
}

// ---------------------------------------------------------------------------
// CLI argument parser (used by the update script, not exported from lib)
// ---------------------------------------------------------------------------

function parseNumber(value: string, key: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer. Received: "${value}"`);
  }
  return parsed;
}

/** @internal — parse CLI args into an `UpdateConfig`. */
export function parseUpdateArgs(argv: string[]): UpdateConfig {
  const result: UpdateConfig = {};

  for (const arg of argv) {
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      result.outputDir = arg.slice("--output-dir=".length).trim();
      continue;
    }
    if (arg.startsWith("--months=")) {
      result.lookbackMonths = parseNumber(
        arg.slice("--months=".length),
        "--months",
      );
      continue;
    }
    if (arg.startsWith("--city-url=")) {
      result.cityUrl = arg.slice("--city-url=".length).trim();
      continue;
    }
    if (arg.startsWith("--asn-url=")) {
      result.asnUrl = arg.slice("--asn-url=".length).trim();
      continue;
    }

    throw new Error(
      `Unknown argument "${arg}". Supported flags: --dry-run, --output-dir=..., --months=..., --city-url=..., --asn-url=...`,
    );
  }

  return result;
}
