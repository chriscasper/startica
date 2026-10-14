import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS in the Electron process; the two copies must agree
import { privateHost as scannerPrivateHost } from "../../../../apps/desktop/scanner/address.mjs";
import { scanRequestAllowed } from "../a11y/urls.ts";
import { isPrivateHost, privateAddress, resolvesPublic } from "./address.ts";

const PRIVATE = [
  "localhost", "app.localhost", "printer.local", "db.internal", "nas.lan", "router.home.arpa",
  "127.0.0.1", "10.1.2.3", "0.0.0.0", "100.64.0.1", "100.127.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1",
  "192.0.2.10", "198.18.0.1", "224.0.0.1", "255.255.255.255",
  "::1", "[::1]", "::", "fe80::1", "fd00::1", "fc00::1", "ff02::1", "2001:db8::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1",
];
const PUBLIC = ["fieldnote.example", "example.org", "93.184.216.34", "1.1.1.1", "100.63.0.1", "100.128.0.1", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"];

describe("private and local addresses", () => {
  it("knows every private, local and reserved range", () => {
    for (const h of PRIVATE) expect(isPrivateHost(h), h).toBe(true);
    for (const h of PUBLIC) expect(isPrivateHost(h), h).toBe(false);
    expect(privateAddress("not an ip")).toBe(true);
  });

  it("matches the Electron scanner's copy on every case", () => {
    for (const h of [...PRIVATE, ...PUBLIC]) expect(scannerPrivateHost(h), h).toBe(isPrivateHost(h));
  });

  it("guards scans with the stricter rules", () => {
    // A public site's page may not reach cloud metadata, carrier NAT or 0.0.0.0.
    for (const target of ["http://169.254.169.254/latest/meta-data", "http://100.64.0.1/", "http://0.0.0.0:8080/", "http://[fe80::1]/"])
      expect(scanRequestAllowed(target, "https://fieldnote.example/", 58300), target).toBe(false);
    // A local site may load local resources, but never Startica itself.
    expect(scanRequestAllowed("http://127.0.0.1:3000/app.js", "http://localhost:3000/", 58300)).toBe(true);
    expect(scanRequestAllowed("http://127.0.0.1:58300/api", "http://localhost:3000/", 58300)).toBe(false);
  });

  it("checks what a name resolves to", async () => {
    expect(await resolvesPublic("127.0.0.1")).toBe(false);
    expect(await resolvesPublic("localhost")).toBe(false);
    expect(await resolvesPublic("93.184.216.34")).toBe(true);
    expect(await resolvesPublic("does-not-exist.invalid")).toBe(false);
  });
});
