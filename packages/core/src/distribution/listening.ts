import { z } from "zod";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { channels, type Channel } from "@startica/db/schema";
import { adapters } from "../channels/index.ts";

/**
 * Pausing the search for conversations (ARCHITECTURE.md section 8.1), per product. Pausing
 * all of it stops the hourly listen_scan for the product, until the owner resumes or for a
 * day or a week; Scan now still searches once. Pausing a source (Reddit, say) skips it in
 * every scan, Scan now included. Pasted links, scoring, drafting and the reply checks on
 * posted replies aren't affected.
 */

/** The sources a scan searches, in the order it reads them. */
export const LISTEN_CHANNELS = Object.keys(adapters) as Channel[];

export const pauseFor = z.enum(["resume", "day", "week", "forever"]);

export type ListeningState = {
  /** The hourly search is off for this product. */
  paused: boolean;
  /** When a timed pause ends (ISO), or null for "until I resume". */
  until: string | null;
  /** Sources skipped in every scan. */
  channels: Channel[];
};

const key = (productId: string) => `listening:${productId}`;
const saved = z.object({
  paused: z.boolean().default(false),
  until: z.string().nullable().default(null),
  channels: z.array(z.enum(channels)).default([]),
});

export async function listeningState(productId: string, now = new Date()): Promise<ListeningState> {
  const parsed = saved.safeParse((await getSetting(key(productId))) ?? {});
  const state = parsed.success ? parsed.data : { paused: false, until: null, channels: [] };
  // A timed pause that has run out is a resumed search.
  if (state.paused && state.until && new Date(state.until) <= now) return { paused: false, until: null, channels: state.channels };
  return { ...state, channels: state.channels.filter((c) => LISTEN_CHANNELS.includes(c)) };
}

/** Pauses or resumes the hourly search: `resume`, or pause for a `day`, a `week` or until resumed (`forever`). */
export async function setListeningPaused(productId: string, mode: z.infer<typeof pauseFor>, now = new Date()): Promise<ListeningState> {
  const current = await listeningState(productId, now);
  const days = mode === "day" ? 1 : mode === "week" ? 7 : null;
  const next: ListeningState =
    mode === "resume"
      ? { ...current, paused: false, until: null }
      : { ...current, paused: true, until: days ? new Date(now.getTime() + days * 86400_000).toISOString() : null };
  await setSetting(key(productId), next);
  return next;
}

/** Turns one source off or back on for every scan. */
export async function setChannelPaused(productId: string, channel: Channel, paused: boolean): Promise<ListeningState> {
  if (!LISTEN_CHANNELS.includes(channel)) throw new Error("Startica doesn't search that source");
  const current = await listeningState(productId);
  const set = new Set(current.channels);
  if (paused) set.add(channel);
  else set.delete(channel);
  const next = { ...current, channels: LISTEN_CHANNELS.filter((c) => set.has(c)) };
  await setSetting(key(productId), next);
  return next;
}
