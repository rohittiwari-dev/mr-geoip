import updateDb from "../lib/update";

updateDb().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nUpdate failed: ${message}`);
  process.exit(1);
});
