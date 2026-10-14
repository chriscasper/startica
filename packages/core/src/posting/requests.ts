import { randomUUID } from "node:crypto";
import { bskyAtUri } from "../channels/bluesky.ts";
import { parseTopicUrl } from "../channels/discourse.ts";
import { redditThingIds } from "../channels/reddit.ts";

/**
 * Assisted posting (ARCHITECTURE.md section 8.4): what the desktop app's posting window
 * should open and fill in. The user always presses the site's own Submit button;
 * these requests only describe the page and the text.
 */

export const postingSites = ["x", "hackernews", "reddit", "linkedin", "bluesky", "mastodon", "discourse"] as const;
export type PostingSite = (typeof postingSites)[number];

export type PostingTarget = { kind: "draft"; opportunityId: string; draftId: string } | { kind: "piece"; pieceId: string };

export type PostingRequest = {
  id: string;
  site: PostingSite;
  mode: "reply" | "post";
  /** The page the posting window loads. */
  openUrl: string;
  /** Text for the reply or post body. */
  text: string;
  /** New posts: title (Reddit, HN). */
  title: string | null;
  /** HN link submissions: the link. */
  link: string | null;
  /** Reddit: the comment's id (without t1_); Discourse: the post number. The window opens that reply box. */
  replyToComment: string | null;
  /** The thread's canonical URL; a new Reddit comment's permalink is built from it. */
  threadUrl: string | null;
  /** Overrides the site's default for "replies will be tracked" in the posting window. */
  tracked?: boolean;
  target: PostingTarget;
};

export const isPostingSite = (channel: string): channel is PostingSite => (postingSites as readonly string[]).includes(channel);

/** Where the user posts from, for sites without one fixed address. */
export type PostingContext = {
  /** The user's own Mastodon server (Settings → Channels → Posting), e.g. "mastodon.social". */
  mastodonServer?: string | null;
  /** For a new Discourse topic: the forum's address (the product's watched forum). */
  discourseForum?: string | null;
  /** Whether replies on X are checked (only with an X API token: each check is a paid read). */
  xTracked?: boolean;
};

// Length limits where the text travels in a URL or the site caps it; longer text is copy-only.
const BLUESKY_MAX = 300;
const MASTODON_MAX = 500; // the default; some servers allow more
const LINKEDIN_MAX = 3000;
const enc = encodeURIComponent;

const X_STATUS = /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i;
const X_INTENT = "https://x.com/intent/tweet";
// X intents carry the text in the URL. Longer text (and threads, which are several
// posts) isn't offered for assisted posting rather than silently cut; copy works.
const X_MAX_TEXT = 4000;

const toOldReddit = (url: string) => url.replace(/^https?:\/\/(?:www\.|old\.|new\.|m\.)?reddit\.com/i, "https://old.reddit.com");
const toWwwReddit = (url: string) => url.replace(/^https?:\/\/(?:www\.|old\.|new\.|m\.)?reddit\.com/i, "https://www.reddit.com");

/** A reply to a conversation from the Inbox, or null when the channel or link doesn't support assisted posting. */
export function replyRequest(
  conversation: { channel: string; url: string; externalId: string; author?: string | null },
  draft: { id: string; body: string },
  opportunityId: string,
  context: PostingContext = {},
): PostingRequest | null {
  const base = { id: randomUUID(), mode: "reply" as const, text: draft.body, title: null, link: null, target: { kind: "draft" as const, opportunityId, draftId: draft.id } };
  switch (conversation.channel) {
    case "x": {
      const id = X_STATUS.exec(conversation.url)?.[1];
      if (!id || draft.body.length > X_MAX_TEXT) return null;
      const params = new URLSearchParams({ in_reply_to: id, text: draft.body });
      return { ...base, site: "x", openUrl: `${X_INTENT}?${params}`, replyToComment: null, threadUrl: conversation.url, tracked: Boolean(context.xTracked) };
    }
    case "hackernews": {
      if (!/^\d+$/.test(conversation.externalId)) return null;
      // An item page (story or comment) has its own reply form.
      return { ...base, site: "hackernews", openUrl: `https://news.ycombinator.com/item?id=${conversation.externalId}`, replyToComment: null, threadUrl: conversation.url };
    }
    case "reddit": {
      const ids = redditThingIds(conversation.url);
      if (!ids) return null;
      const thread = conversation.url.split(/[?#]/)[0]!.replace(/\/?$/, "/");
      // A comment permalink ends in the comment id; the thread is the part before it.
      const threadUrl = ids.commentId ? thread.replace(new RegExp(`${ids.commentId}/$`), "") : thread;
      return { ...base, site: "reddit", openUrl: toOldReddit(thread), replyToComment: ids.commentId, threadUrl: toWwwReddit(threadUrl) };
    }
    case "linkedin": {
      if (!/linkedin\.com\/(feed\/update|posts)\//i.test(conversation.url) || draft.body.length > LINKEDIN_MAX) return null;
      return { ...base, site: "linkedin", openUrl: conversation.url, replyToComment: null, threadUrl: conversation.url };
    }
    case "bluesky": {
      if (!bskyAtUri(conversation.url) || draft.body.length > BLUESKY_MAX) return null;
      return { ...base, site: "bluesky", openUrl: conversation.url, replyToComment: null, threadUrl: conversation.url };
    }
    case "mastodon": {
      // Replies come from the user's own server: authorize_interaction opens the post there.
      const server = context.mastodonServer;
      // Mastodon starts a reply with "@author "; it counts toward the limit.
      const mention = conversation.author ? conversation.author.length + 2 : 0;
      if (!server || !/^https?:\/\//.test(conversation.externalId) || draft.body.length + mention > MASTODON_MAX) return null;
      return { ...base, site: "mastodon", openUrl: `https://${server}/authorize_interaction?uri=${enc(conversation.externalId)}`, replyToComment: null, threadUrl: conversation.url };
    }
    case "discourse": {
      const ref = parseTopicUrl(conversation.url);
      if (!ref) return null;
      return { ...base, site: "discourse", openUrl: conversation.url, replyToComment: ref.postNumber > 1 ? String(ref.postNumber) : null, threadUrl: conversation.url };
    }
    default:
      return null;
  }
}

/** A new post from Content Studio, or null for channels without assisted posting. */
export function pieceRequest(
  piece: { id: string; channel: string; format?: string; title: string | null; body: string },
  context: PostingContext = {},
): PostingRequest | null {
  const base = { id: randomUUID(), mode: "post" as const, replyToComment: null, threadUrl: null, target: { kind: "piece" as const, pieceId: piece.id } };
  switch (piece.channel) {
    case "x": {
      if (piece.format === "thread" || piece.body.length > X_MAX_TEXT) return null;
      const params = new URLSearchParams({ text: piece.body });
      return { ...base, site: "x", openUrl: `${X_INTENT}?${params}`, text: piece.body, title: null, link: null, tracked: Boolean(context.xTracked) };
    }
    case "hackernews": {
      // A body that is only a link is a link submission; anything else is a text post.
      const onlyLink = /^https?:\/\/\S+$/.test(piece.body.trim()) ? piece.body.trim() : null;
      return { ...base, site: "hackernews", openUrl: "https://news.ycombinator.com/submit", text: onlyLink ? "" : piece.body, title: piece.title, link: onlyLink };
    }
    case "reddit":
      // The user picks the subreddit in Reddit's form.
      return { ...base, site: "reddit", openUrl: "https://old.reddit.com/submit?selftext=true", text: piece.body, title: piece.title, link: null };
    case "linkedin":
      // LinkedIn's own share link opens the composer with the text in it.
      if (piece.body.length > LINKEDIN_MAX) return null;
      return { ...base, site: "linkedin", openUrl: `https://www.linkedin.com/feed/?shareActive=true&text=${enc(piece.body)}`, text: piece.body, title: null, link: null };
    case "bluesky":
      if (piece.format === "thread" || piece.body.length > BLUESKY_MAX) return null;
      return { ...base, site: "bluesky", openUrl: `https://bsky.app/intent/compose?text=${enc(piece.body)}`, text: piece.body, title: null, link: null };
    case "mastodon":
      if (!context.mastodonServer || piece.format === "thread" || piece.body.length > MASTODON_MAX) return null;
      return { ...base, site: "mastodon", openUrl: `https://${context.mastodonServer}/share?text=${enc(piece.body)}`, text: piece.body, title: null, link: null };
    case "discourse":
      // Discourse's new-topic link pre-fills the title and body; the user picks the category.
      if (!context.discourseForum) return null;
      return {
        ...base,
        site: "discourse",
        openUrl: `${context.discourseForum.replace(/\/$/, "")}/new-topic?title=${enc(piece.title ?? "")}&body=${enc(piece.body)}`,
        text: piece.body,
        title: piece.title,
        link: null,
      };
    default:
      return null;
  }
}
