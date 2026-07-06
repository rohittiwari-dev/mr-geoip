import { lookup, lookupAsync, GeoIP, createCustomIpData } from "./src/index";

console.log("--- mr-geopip one-liner test ---\n");

console.log("lookup('8.8.8.8') [Default, no traits]:", lookup("8.8.8.8"));
console.log("\nlookup('8.8.8.8', { traits: true }) [With traits]:", lookup("8.8.8.8", { traits: true }));

console.log("\n--- Async Lookup test ---");
const asyncResult = await lookupAsync("8.8.8.8");
console.log("lookupAsync('8.8.8.8'):", asyncResult);

console.log("\n--- Advanced creation with metadata and auto-update ---");
const geo = GeoIP.create({
  traits: true,
  autoUpdate: {
    intervalMs: 60000,
    onUpdate: () => console.log("Background DB update done!"),
  }
});

console.log("Database metadata:", geo.dbMetadata);

// Clean up
await geo.close();
console.log("\n--- Done ---");
