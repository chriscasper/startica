// Which hosts are on this computer or a private network, for the scanner's request guard.
// The same rules as packages/core/src/net/address.ts (this is plain JS for the Electron
// process); packages/core/src/net/address.test.ts checks the two agree.
import { isIP } from "node:net";

export function privateAddress(ip) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return privateAddress(mapped[1]);
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || v.startsWith("2001:db8");
  }
  return true;
}
const LOCAL_NAMES = /(^localhost$|\.localhost$|\.local$|\.internal$|\.lan$|\.home\.arpa$)/;
export function privateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return isIP(h) ? privateAddress(h) : LOCAL_NAMES.test(h);
}
