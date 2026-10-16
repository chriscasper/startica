import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "./client.ts";
import { secrets } from "./schema.ts";

/**
 * Secrets (API keys, tokens, connection URLs) are stored encrypted in the
 * `secrets` table. In the desktop app the cipher is Electron's safeStorage, which
 * uses the OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret). Outside
 * Electron (dev in a browser, tests) a key file in the data folder is used.
 */
export type Cipher = {
  name: string;
  encrypt(plain: string): string | Promise<string>;
  decrypt(ciphertext: string): string | Promise<string>;
};

const CIPHER_KEY = Symbol.for("startica.cipher");
const store = globalThis as unknown as { [CIPHER_KEY]?: Cipher };

export function setCipher(cipher: Cipher): void {
  store[CIPHER_KEY] = cipher;
}

function cipher(): Cipher {
  const c = store[CIPHER_KEY];
  if (!c) throw new Error("No secret cipher configured: call setCipher() at startup");
  return c;
}

/** AES-256-GCM with a random key kept in a 0600 file. For development only. */
export function fileKeyCipher(keyPath: string): Cipher {
  if (!existsSync(keyPath)) {
    writeFileSync(keyPath, randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  chmodSync(keyPath, 0o600);
  const key = Buffer.from(readFileSync(keyPath, "utf8").trim(), "base64");
  return {
    name: "file-key",
    encrypt(plain) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
    },
    decrypt(ciphertext) {
      const [version, iv, tag, body] = ciphertext.split(".");
      if (version !== "v1" || !iv || !tag || !body) throw new Error("Unreadable secret");
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
    },
  };
}

/** Creates or replaces the secret called `name`; returns its id. */
export async function putSecret(name: string, value: string): Promise<string> {
  const db = getDb();
  const ciphertext = await cipher().encrypt(value);
  const [row] = await db
    .insert(secrets)
    .values({ name, ciphertext })
    .onConflictDoUpdate({ target: secrets.name, set: { ciphertext, updatedAt: new Date() } })
    .returning({ id: secrets.id });
  return row!.id;
}

export async function updateSecret(id: string, value: string): Promise<void> {
  await getDb()
    .update(secrets)
    .set({ ciphertext: await cipher().encrypt(value) })
    .where(eq(secrets.id, id));
}

export async function readSecret(id: string): Promise<string | null> {
  const [row] = await getDb().select({ ciphertext: secrets.ciphertext }).from(secrets).where(eq(secrets.id, id));
  return row ? await cipher().decrypt(row.ciphertext) : null;
}

export async function readSecretByName(name: string): Promise<string | null> {
  const [row] = await getDb().select({ ciphertext: secrets.ciphertext }).from(secrets).where(eq(secrets.name, name));
  return row ? await cipher().decrypt(row.ciphertext) : null;
}

/** Whether a secret called `name` is saved, without decrypting it (pages only need to know it's there). */
export async function hasSecretNamed(name: string): Promise<boolean> {
  const [row] = await getDb().select({ id: secrets.id }).from(secrets).where(eq(secrets.name, name));
  return Boolean(row);
}

/**
 * Re-encrypts, with the current cipher, the secrets that browser dev mode saved with the key
 * file (`v1.` ciphertexts), so a data folder used in development keeps working in the desktop
 * app. Secrets the key can't read are left alone; they fail where they're used, which asks
 * the user to save them again. Returns how many were moved.
 */
export async function adoptFileKeySecrets(keyPath: string): Promise<number> {
  if (!existsSync(keyPath)) return 0;
  const db = getDb();
  const rows = (await db.select({ id: secrets.id, ciphertext: secrets.ciphertext }).from(secrets)).filter((r) => r.ciphertext.startsWith("v1."));
  if (!rows.length) return 0;
  const fileKey = fileKeyCipher(keyPath);
  let moved = 0;
  for (const row of rows) {
    let plain: string;
    try {
      plain = await fileKey.decrypt(row.ciphertext);
    } catch {
      continue;
    }
    await db.update(secrets).set({ ciphertext: await cipher().encrypt(plain) }).where(eq(secrets.id, row.id));
    moved++;
  }
  return moved;
}

export async function deleteSecret(id: string): Promise<void> {
  await getDb().delete(secrets).where(eq(secrets.id, id));
}

/**
 * Cipher for the server process when it runs as a child of the Electron app:
 * encryption happens in the Electron main process (safeStorage / OS keychain),
 * reached over the child-process IPC channel.
 */
export function ipcCipher(): Cipher {
  if (!process.send) throw new Error("ipcCipher needs an IPC channel to the Electron app");
  let nextId = 0;
  const pending = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  process.on("message", (message: { type?: string; id?: number; result?: string; error?: string }) => {
    if (message?.type !== "cipher-result" || message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error));
    else waiter.resolve(message.result ?? "");
  });
  const call = (op: "encrypt" | "decrypt", data: string) =>
    new Promise<string>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      process.send!({ type: "cipher", id, op, data });
    });
  return { name: "os-keychain", encrypt: (plain) => call("encrypt", plain), decrypt: (ciphertext) => call("decrypt", ciphertext) };
}
