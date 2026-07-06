import { updateDb } from "./updater";
import { BUNDLED_DATA_DIR } from "./paths";

async function run() {
  const skip =
    process.env.MR_GEOPIP_SKIP_DOWNLOAD === "true" ||
    process.env.MR_GEOPIP_SKIP_DOWNLOAD === "1" ||
    process.env.GEOMIP_SKIP_DOWNLOAD === "true" ||
    process.env.GEOMIP_SKIP_DOWNLOAD === "1";

  if (skip) {
    console.log("[mr-geoip] Database download skipped via env variable.");
    return;
  }

  console.log("[mr-geoip] Downloading GeoIP databases...");
  try {
    await updateDb({
      outputDir: BUNDLED_DATA_DIR,
    });
    console.log("[mr-geoip] GeoIP databases downloaded successfully.");
  } catch (err: any) {
    console.warn("\n======================================================================");
    console.warn("[mr-geoip] WARNING: Auto-download of database files failed:");
    console.warn(`  ${err.message || err}`);
    console.warn("\n  The installation succeeded, but local lookups will be unavailable");
    console.warn("  until the databases are downloaded.");
    console.warn("  ");
    console.warn("  You can download the databases manually at any time by running:");
    console.warn("    npx mr-geoip-update");
    console.warn("======================================================================\n");
    // Resilient exit code 0 to prevent breaking installs in offline environments
    process.exit(0);
  }
}

run();
