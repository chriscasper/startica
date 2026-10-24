export type { Channel } from "@startica/db/schema";
import type { Channel } from "@startica/db/schema";

/** A post or comment as a channel returns it, before it's stored as a conversation. */
export type RawConversation = {
  channel: Channel;
  externalId: string;
  url: string;
  kind: "post" | "comment";
  community: string | null;
  author: string | null;
  title: string | null;
  threadTitle: string | null;
  body: string;
  postedAt: Date | null;
  score: number | null;
  numComments: number | null;
};

export type ListeningQuery = {
  keywords: string[];
  /** Watched communities on this adapter's channel: a subreddit name, a "#tag@server" for Mastodon, a forum for Discourse (its URL). */
  communities: { name: string; url: string | null }[];
  since: Date;
  /** Aborted when the user stops the scan: adapters stop between requests. */
  signal?: AbortSignal;
};

export type Engagement = { score: number | null; replies: number | null; removed: boolean };

/** A reply below something the owner posted; `inReplyTo` is the external id it answers (the post, or another reply). */
export type RawReply = RawConversation & { inReplyTo: string | null };

/**
 * What engagement_sync reads for one of the owner's posts: its engagement and the replies below it.
 * `ownerAuthor` is the post's own author as the channel names it, so the owner's own replies are skipped.
 */
export type ReplyThread = { engagement: Engagement | null; ownerAuthor: string | null; replies: RawReply[] };

/** At most this many replies are kept per post and sync (newest first). */
export const MAX_REPLIES_PER_POST = 50;

/** Keeps replies that aren't the owner's own (by author, ignoring case) and have text; newest first, capped. */
export function othersReplies(replies: RawReply[], ownerAuthor: string | null): RawReply[] {
  const owner = ownerAuthor?.trim().toLowerCase();
  return replies
    .filter((r) => r.body.trim() && !(owner && r.author?.trim().toLowerCase() === owner))
    .sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0))
    .slice(0, MAX_REPLIES_PER_POST);
}

/**
 * One implementation per channel. LinkedIn and Facebook have no adapter: the owner
 * pastes the text. X has one only with the user's own API token. See ARCHITECTURE.md 8.1.
 */
export interface ChannelAdapter {
  channel: Channel;
  /** Find new conversations matching the product's keywords and communities. */
  discover(query: ListeningQuery): Promise<RawConversation[]>;
  /** Load one conversation from its URL; null when the URL isn't this channel's. */
  fetchThread(url: string): Promise<RawConversation | null>;
  /** Current engagement for something the owner posted. */
  fetchEngagement?(url: string): Promise<Engagement | null>;
  /**
   * Engagement plus the replies below something the owner posted, through public reads only
   * (no sign-in). Replaces `fetchEngagement` in engagement_sync where it exists, so a
   * rate-limited channel (Reddit) is read once per post.
   */
  fetchReplies?(url: string): Promise<ReplyThread | null>;
}
