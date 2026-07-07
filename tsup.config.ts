import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./src/index.ts", "./src/postinstall.ts", "./src/cli.ts"],
  format: ["esm", "cjs"],
  clean: true,
  dts: false,
  sourcemap: false,
  splitting: false,
  minify: true,
  shims: true,
  treeshake: true,
  target: "node18",
});
