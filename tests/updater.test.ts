import { describe, it, expect } from "vitest";
import { parseUpdateArgs } from "../src/updater";

describe("parseUpdateArgs", () => {
  it("returns defaults for empty argv", () => {
    const config = parseUpdateArgs([]);
    expect(config).toEqual({});
  });

  it("parses --dry-run", () => {
    const config = parseUpdateArgs(["--dry-run"]);
    expect(config.dryRun).toBe(true);
  });

  it("parses --output-dir", () => {
    const config = parseUpdateArgs(["--output-dir=custom-data"]);
    expect(config.outputDir).toBe("custom-data");
  });

  it("parses --months", () => {
    const config = parseUpdateArgs(["--months=6"]);
    expect(config.lookbackMonths).toBe(6);
  });

  it("parses --city-url", () => {
    const url = "https://example.com/city.mmdb";
    const config = parseUpdateArgs([`--city-url=${url}`]);
    expect(config.cityUrl).toBe(url);
  });

  it("parses --asn-url", () => {
    const url = "https://example.com/asn.mmdb";
    const config = parseUpdateArgs([`--asn-url=${url}`]);
    expect(config.asnUrl).toBe(url);
  });

  it("parses multiple flags together", () => {
    const config = parseUpdateArgs([
      "--dry-run",
      "--output-dir=out",
      "--months=3",
    ]);
    expect(config.dryRun).toBe(true);
    expect(config.outputDir).toBe("out");
    expect(config.lookbackMonths).toBe(3);
  });

  it("throws on unknown argument", () => {
    expect(() => parseUpdateArgs(["--unknown"])).toThrow("Unknown argument");
  });

  it("throws on invalid --months value", () => {
    expect(() => parseUpdateArgs(["--months=abc"])).toThrow("positive integer");
    expect(() => parseUpdateArgs(["--months=-1"])).toThrow("positive integer");
    expect(() => parseUpdateArgs(["--months=0"])).toThrow("positive integer");
  });
});
