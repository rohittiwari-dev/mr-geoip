import { lookup } from "./src/index";

// One-liner — zero config, no await
console.log("--- mr-geopip one-liner test ---\n");

console.log("lookup('8.8.8.8') [Default, no traits]:", lookup("8.8.8.8"));
console.log("\nlookup('8.8.8.8', { traits: true }) [With traits]:", lookup("8.8.8.8", { traits: true }));

console.log("\n--- Done ---");
