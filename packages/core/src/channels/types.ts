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
}
