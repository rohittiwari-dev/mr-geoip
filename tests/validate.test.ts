import { describe, it, expect } from "vitest";
import { isValidIP, isValidIPv4, isValidIPv6 } from "../src/validate";

describe("isValidIPv4", () => {
  it("accepts standard IPv4 addresses", () => {
    expect(isValidIPv4("8.8.8.8")).toBe(true);
    expect(isValidIPv4("1.1.1.1")).toBe(true);
    expect(isValidIPv4("192.168.0.1")).toBe(true);
    expect(isValidIPv4("0.0.0.0")).toBe(true);
    expect(isValidIPv4("255.255.255.255")).toBe(true);
    expect(isValidIPv4("10.0.0.1")).toBe(true);
  });

  it("rejects IPv6 addresses", () => {
    expect(isValidIPv4("::1")).toBe(false);
    expect(isValidIPv4("2001:4860:4860::8888")).toBe(false);
    expect(isValidIPv4("fe80::1")).toBe(false);
  });

  it("rejects invalid strings", () => {
    expect(isValidIPv4("")).toBe(false);
    expect(isValidIPv4("not-an-ip")).toBe(false);
    expect(isValidIPv4("256.1.1.1")).toBe(false);
    expect(isValidIPv4("1.2.3")).toBe(false);
    expect(isValidIPv4("1.2.3.4.5")).toBe(false);
    expect(isValidIPv4("abc.def.ghi.jkl")).toBe(false);
    expect(isValidIPv4("192.168.1.999")).toBe(false);
  });
});

describe("isValidIPv6", () => {
  it("accepts standard IPv6 addresses", () => {
    expect(isValidIPv6("::1")).toBe(true);
    expect(isValidIPv6("2001:4860:4860::8888")).toBe(true);
    expect(isValidIPv6("fe80::1")).toBe(true);
    expect(isValidIPv6("::")).toBe(true);
    expect(isValidIPv6("::ffff:192.0.2.1")).toBe(true);
  });

  it("rejects IPv4 addresses", () => {
    expect(isValidIPv6("8.8.8.8")).toBe(false);
    expect(isValidIPv6("192.168.0.1")).toBe(false);
  });

  it("rejects invalid strings", () => {
    expect(isValidIPv6("")).toBe(false);
    expect(isValidIPv6("not-an-ip")).toBe(false);
    expect(isValidIPv6("12345::1")).toBe(false);
  });
});

describe("isValidIP", () => {
  it("accepts both IPv4 and IPv6", () => {
    expect(isValidIP("8.8.8.8")).toBe(true);
    expect(isValidIP("::1")).toBe(true);
    expect(isValidIP("2001:4860:4860::8888")).toBe(true);
    expect(isValidIP("10.0.0.1")).toBe(true);
  });

  it("rejects non-IP strings", () => {
    expect(isValidIP("")).toBe(false);
    expect(isValidIP("hello")).toBe(false);
    expect(isValidIP("999.999.999.999")).toBe(false);
    expect(isValidIP("http://8.8.8.8")).toBe(false);
  });
});
