#!/usr/bin/env node
import { updateDb, parseUpdateArgs } from "./updater";

async function main() {
  try {
    const config = parseUpdateArgs(process.argv.slice(2));
    await updateDb(config);
  } catch (err: any) {
    console.error(`[mr-geoip] CLI Update failed:`, err.message || err);
    process.exit(1);
  }
}

main();
