import { describe, it, expect } from "vitest";
import {
  GeoIPError,
  GeoIPNotInitializedError,
  InvalidIPError,
  DatabaseNotFoundError,
  DatabaseReadError,
  CustomStoreNotConfiguredError,
} from "../src/errors";

describe("GeoIPError", () => {
  it("is an instance of Error", () => {
    const err = new GeoIPError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GeoIPError);
    expect(err.name).toBe("GeoIPError");
    expect(err.message).toBe("test");
  });
});

describe("GeoIPNotInitializedError", () => {
  it("extends GeoIPError with a fixed message", () => {
    const err = new GeoIPNotInitializedError();
    expect(err).toBeInstanceOf(GeoIPError);
    expect(err.name).toBe("GeoIPNotInitializedError");
    expect(err.message).toContain("not initialized");
  });
});

describe("InvalidIPError", () => {
  it("includes the offending IP in the message and as a property", () => {
    const err = new InvalidIPError("bad-ip");
    expect(err).toBeInstanceOf(GeoIPError);
    expect(err.name).toBe("InvalidIPError");
    expect(err.ip).toBe("bad-ip");
    expect(err.message).toContain("bad-ip");
  });
});

describe("DatabaseNotFoundError", () => {
  it("includes the missing path", () => {
    const err = new DatabaseNotFoundError("/some/path.mmdb");
    expect(err).toBeInstanceOf(GeoIPError);
    expect(err.name).toBe("DatabaseNotFoundError");
    expect(err.path).toBe("/some/path.mmdb");
    expect(err.message).toContain("/some/path.mmdb");
  });
});

describe("DatabaseReadError", () => {
  it("wraps a cause error", () => {
    const cause = new Error("corrupt");
    const err = new DatabaseReadError("/db.mmdb", cause);
    expect(err).toBeInstanceOf(GeoIPError);
    expect(err.name).toBe("DatabaseReadError");
    expect(err.path).toBe("/db.mmdb");
    expect(err.message).toContain("corrupt");
    expect(err.cause).toBe(cause);
  });

  it("works without a cause", () => {
    const err = new DatabaseReadError("/db.mmdb");
    expect(err.message).toContain("/db.mmdb");
    expect(err.cause).toBeUndefined();
  });
});

describe("CustomStoreNotConfiguredError", () => {
  it("has a descriptive message", () => {
    const err = new CustomStoreNotConfiguredError();
    expect(err).toBeInstanceOf(GeoIPError);
    expect(err.name).toBe("CustomStoreNotConfiguredError");
    expect(err.message).toContain("not configured");
  });
});

describe("catch-all pattern", () => {
  it("all errors can be caught with GeoIPError", () => {
    const errors = [
      new GeoIPNotInitializedError(),
      new InvalidIPError("x"),
      new DatabaseNotFoundError("x"),
      new DatabaseReadError("x"),
      new CustomStoreNotConfiguredError(),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(GeoIPError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});
