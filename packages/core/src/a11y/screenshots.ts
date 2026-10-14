import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "@startica/db/paths";

/**
 * Page screenshots for highlights (ARCHITECTURE.md section 9.3): the latest one per page, as a
 * JPEG under <data>/a11y/<site id>/, taken only when the page had issues. Never sent
 * anywhere; deleted with the site.
 */

const siteFolder = (siteId: string) => join(dataDir(), "a11y", siteId);
const safeId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Saves a page's screenshot (base64 JPEG) and returns its file name. */
export function saveScreenshot(siteId: string, pageId: string, base64: string): string | null {
  if (!safeId(siteId) || !safeId(pageId)) return null;
  const file = `${pageId}.jpg`;
  mkdirSync(siteFolder(siteId), { recursive: true });
  writeFileSync(join(siteFolder(siteId), file), Buffer.from(base64, "base64"));
  return file;
}

export function deleteScreenshot(siteId: string, file: string | null): void {
  if (!file || !safeId(siteId) || !/^[0-9a-f-]{36}\.jpg$/i.test(file)) return;
  rmSync(join(siteFolder(siteId), file), { force: true });
}

export function readScreenshot(siteId: string, file: string): Buffer | null {
  if (!safeId(siteId) || !/^[0-9a-f-]{36}\.jpg$/i.test(file)) return null;
  try {
    return readFileSync(join(siteFolder(siteId), file));
  } catch {
    return null;
  }
}

export function deleteSiteScreenshots(siteId: string): void {
  if (safeId(siteId)) rmSync(siteFolder(siteId), { recursive: true, force: true });
}
