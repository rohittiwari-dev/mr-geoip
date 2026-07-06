import { isIP as netIsIP } from "node:net";

/**
 * Returns `true` when `ip` is a valid IPv4 or IPv6 address.
 */
export function isValidIP(ip: string): boolean {
  return netIsIP(ip) !== 0;
}

/**
 * Returns `true` when `ip` is a valid IPv4 address.
 */
export function isValidIPv4(ip: string): boolean {
  return netIsIP(ip) === 4;
}

/**
 * Returns `true` when `ip` is a valid IPv6 address.
 */
export function isValidIPv6(ip: string): boolean {
  return netIsIP(ip) === 6;
}
