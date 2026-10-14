/**
 * Near-duplicate detection for conversations (cross-posts, reposts, the same
 * story submitted twice). MinHash over word 3-grams estimates how much two texts
 * overlap; it catches copies with small edits, which is what "duplicate" means
 * here (ARCHITECTURE.md section 3: chosen over embeddings, which would need a local model).
 */

const HASHES = 64;
const SHINGLE = 3;
/** Texts shorter than this (e.g. a link post's title) are too short to compare reliably. */
const MIN_WORDS = 12;
/** Estimated Jaccard overlap of 3-grams at or above which two texts count as the same. A changed title plus a
 * couple of small edits keeps ~0.6–0.8 of a short post's 3-grams; unrelated posts on one topic share < 0.3. */
export const DUPLICATE_THRESHOLD = 0.6;

// Marker fetchThread appends before the top replies; replies aren't part of the post.
const REPLIES_MARKER = "\n\nTop replies so far:";

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** FNV-1a, 32-bit. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Murmur3 finalizer: turns one base hash into HASHES independent-enough ones. */
function mix(h: number, seed: number): number {
  h = Math.imul(h ^ seed, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const SEEDS = Array.from({ length: HASHES }, (_, i) => mix(i + 1, 0x9e3779b9));

/** MinHash signature as hex, or null when the text is too short to compare. */
export function fingerprint(title: string | null, body: string): string | null {
  const postBody = body.split(REPLIES_MARKER)[0] ?? "";
  const w = words(`${title ?? ""} ${postBody}`);
  if (w.length < MIN_WORDS) return null;
  const mins = new Array<number>(HASHES).fill(0xffffffff);
  for (let i = 0; i + SHINGLE <= w.length; i++) {
    const base = hashString(w.slice(i, i + SHINGLE).join(" "));
    for (let k = 0; k < HASHES; k++) {
      const v = mix(base, SEEDS[k]!);
      if (v < mins[k]!) mins[k] = v;
    }
  }
  return mins.map((m) => m.toString(16).padStart(8, "0")).join("");
}

/** Estimated Jaccard overlap (0 to 1) of two signatures. */
export function similarity(a: string, b: string): number {
  if (a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i += 8) if (a.slice(i, i + 8) === b.slice(i, i + 8)) same++;
  return same / (a.length / 8);
}

export type FingerprintCandidate = { id: string; fingerprint: string };

/** The most similar candidate at or above the threshold, if any. */
export function findNearDuplicate<C extends FingerprintCandidate>(fp: string, candidates: C[]): C | null {
  let best: C | null = null;
  let bestScore = DUPLICATE_THRESHOLD;
  for (const c of candidates) {
    const s = similarity(fp, c.fingerprint);
    if (s >= bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}
