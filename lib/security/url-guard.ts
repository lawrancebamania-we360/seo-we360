import { lookup } from "node:dns/promises";
import net from "node:net";

// SSRF guard for any server-side fetch of a user-supplied URL/host (competitor
// URLs, project domains). Tenants can put arbitrary hosts in these fields, and
// our crawler/orchestrator fetches them server-side - without this, a member
// could point Klimb at 169.254.169.254 (cloud metadata), localhost, or an
// internal service and use the audit as a blind SSRF probe.

/** True if an IPv4/IPv6 literal is private / loopback / link-local / reserved. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 127) return true;                         // loopback
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 169 && b === 254) return true;            // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64.0.0/10
    if (a >= 224) return true;                          // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;         // loopback / unspecified
    if (v.startsWith("fe80")) return true;             // link-local
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique-local
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7)); // IPv4-mapped
    return false;
  }
  return false;
}

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".cluster.local"];

/**
 * Synchronous, no-DNS check for an OBVIOUSLY-internal host (a literal private
 * IP, localhost, or an internal TLD). Use at write time (e.g. saving a project
 * domain) to reject internal targets without requiring DNS resolution - so a
 * brand-new, not-yet-propagated public domain still passes. The full
 * DNS-resolving check (assertPublicUrl) runs at fetch time.
 */
export function isObviouslyInternalHost(rawHost: string): boolean {
  // note: NOT lib/url.cleanHost - this SSRF guard strips the FULL path, the port,
  // and a trailing dot, and deliberately KEEPS "www." (cleanHost strips www and
  // only the trailing slash). Different normalization on purpose; leave as-is.
  const host = rawHost.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!host || host === "localhost") return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (net.isIP(host) && isPrivateIp(host)) return true;
  return false;
}

/**
 * Validate a user-supplied URL is safe to fetch server-side. Requires http(s),
 * rejects obviously-internal hostnames, and resolves DNS to reject hosts that
 * point at a private/loopback/link-local IP (defends against DNS rebinding
 * where a public name resolves to an internal address).
 *
 * @param rawUrl a full URL or a bare hostname/domain
 * @returns the validated URL string (https:// prefixed if a bare host was given)
 * @throws if the target is not a public http(s) endpoint
 */
export async function assertPublicUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new Error(`Refusing to fetch malformed URL: ${rawUrl.slice(0, 80)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Refusing to fetch non-http(s) URL: ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new Error(`Refusing to fetch internal host: ${host}`);
  }
  // Literal IP in the host → check directly.
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`Refusing to fetch private IP: ${host}`);
    return parsed.toString();
  }
  // Resolve DNS and reject if ANY address is internal.
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length) throw new Error(`Host does not resolve: ${host}`);
    for (const a of addrs) {
      if (isPrivateIp(a.address)) {
        throw new Error(`Refusing to fetch host resolving to a private IP: ${host} → ${a.address}`);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Refusing")) throw e;
    throw new Error(`Could not resolve host for SSRF check: ${host}`);
  }
  return parsed.toString();
}
