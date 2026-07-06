import { updateDb, parseUpdateArgs } from "../src/updater";

const config = parseUpdateArgs(process.argv.slice(2));

updateDb(config).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nUpdate failed: ${message}`);
  process.exit(1);
});
