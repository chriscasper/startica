import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Which hosts and addresses are on this computer or a private network, in one place: the
 * scanner's request guard, product database SSL, Security, issue trackers and Off-site all
 * use it. Keep apps/desktop/scanner/scanner.mjs (plain JS in the Electron process) in step.
 */

/** Whether an IP address is private, local, link-local, shared, reserved or multicast (v4, v6 and v4-mapped v6). */
export function privateAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return privateAddress(mapped[1]!);
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 || // this network, private, loopback, multicast and reserved
      (a === 100 && b >= 64 && b <= 127) || // shared address space (carrier NAT, Tailscale)
      (a === 169 && b === 254) || // link-local (cloud metadata lives here)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || // IETF protocol assignments and documentation
      (a === 198 && (b === 18 || b === 19)) // benchmarking
    );
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || v.startsWith("2001:db8");
  }
  return true;
}

/** Names that only mean something on this computer or a local network. */
const LOCAL_NAMES = /(^localhost$|\.localhost$|\.local$|\.internal$|\.lan$|\.home\.arpa$)/;

/** Whether a host name or address literal is local or private (no DNS lookup: see resolvesPublic). */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(h)) return privateAddress(h);
  return LOCAL_NAMES.test(h);
}

/** Every address the name resolves to is public (for URLs Startica didn't get from its owner). */
export async function resolvesPublic(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return !privateAddress(host);
  if (isPrivateHost(host)) return false;
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => !privateAddress(a.address));
  } catch {
    return false;
  }
}
