import { asc, eq } from "drizzle-orm";
import { getDb } from "./client.ts";
import { aiModels, settings, workspaces } from "./schema.ts";

// Task -> model routing (ARCHITECTURE.md section 5). Editable in Settings.
export const DEFAULT_AI_MODELS = [
  { task: "ping", model: "claude-haiku-5-5", effort: "low", maxTokens: 256 },
  { task: "strategy", model: "claude-opus-5-5", effort: "high", maxTokens: 16000 },
  { task: "research", model: "claude-opus-5-5", effort: "high", maxTokens: 16000 },
  { task: "draft", model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 },
  { task: "vision", model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 },
  { task: "score", model: "claude-haiku-5-5", effort: "low", maxTokens: 1024 },
  { task: "answer", model: "claude-sonnet-5-5", effort: "low", maxTokens: 4000 },
  // Ads AD2: OpenAI only (needs an OpenAI key whatever the default provider); effort is the image quality.
  { task: "image", model: "gpt-image-2.5-flare", effort: "medium", maxTokens: 4096 },
] as const;

/** Returns the workspace, creating it (with default AI routing) on first launch. */
export async function ensureWorkspace(): Promise<{ id: string; name: string }> {
  const db = getDb();
  const [existing] = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).orderBy(asc(workspaces.createdAt)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(workspaces).values({ name: "Startica" }).returning({ id: workspaces.id, name: workspaces.name });
  await db.insert(aiModels).values(DEFAULT_AI_MODELS.map((m) => ({ ...m, workspaceId: created!.id })));
  return created!;
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await getDb().select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return (row?.value as T | undefined) ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await getDb()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function deleteSetting(key: string): Promise<void> {
  await getDb().delete(settings).where(eq(settings.key, key));
}
