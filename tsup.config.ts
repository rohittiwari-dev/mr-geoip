import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/postinstall.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  dts: {
    compilerOptions: {
      // tsup internally sets `baseUrl` for DTS generation, which is
      // deprecated in TypeScript 7.0. Silence the warning.
      ignoreDeprecations: "6.0",
    },
  },
  clean: true,
  sourcemap: true,
  splitting: false,
  target: "node18",
  // Bundle lru-cache (ESM-only) to avoid CJS import issues.
  // mmdb-lib supports both ESM and CJS — keep it external.
  noExternal: ["lru-cache"],
});
