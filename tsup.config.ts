import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/postinstall.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  clean: true,
  sourcemap: false,
  splitting: false,
  minify: true,
  shims: true,
  treeshake: true,
  target: "node18",
  noExternal: ["lru-cache"],
});
