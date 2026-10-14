// Unit tests for the per-site parts of assisted posting: `yarn workspace @startica/desktop test`.
// The fill-in scripts themselves run in Chromium in the desktop smoke test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fillScript, formText, isBlueskyPost, latestHnItem, parseBlueskyResponse, parseDiscourseResponse, parseLinkedInResponse, parseMastodonResponse, parseRedditResponse, parseXResponse, sites, xText } from "./sites.mjs";

const reply = { mode: "reply", text: 'A "quoted" reply\nwith </script> in it', threadUrl: "https://www.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/" };

test("fill scripts are valid JavaScript for every site, even with awkward text", () => {
  for (const site of Object.keys(sites)) assert.doesNotThrow(() => new Function(`return ${fillScript(site, reply)}`), site);
});

test("X: the new post's id comes from CreateTweet or CreateNoteTweet", () => {
  assert.equal(parseXResponse(JSON.stringify({ data: { create_tweet: { tweet_results: { result: { rest_id: "1844" } } } } })), "https://x.com/i/status/1844");
  assert.equal(parseXResponse(JSON.stringify({ data: { notetweet_create: { tweet_results: { result: { rest_id: "77" } } } } })), "https://x.com/i/status/77");
  assert.equal(parseXResponse(JSON.stringify({ errors: [{ message: "duplicate" }] })), null);
  assert.equal(parseXResponse("not json"), null);
});

test("Reddit: comment ids and new post links from old.reddit.com responses", () => {
  const comment = JSON.stringify({ jquery: [[0, 1, "call", [[{ kind: "t1", data: { id: "t1_peq9zz1", parent: "t1_pellhxs", link: "t3_1x0kat2" } }]]]] });
  assert.equal(parseRedditResponse(comment, reply), "https://www.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/peq9zz1/");
  const submit = JSON.stringify({ jquery: [[0, 1, "call", ["https://old.reddit.com/r/Fieldnote/comments/1x9abcd/hello_world/"]]] });
  assert.equal(parseRedditResponse(submit, { mode: "post" }), "https://www.reddit.com/r/Fieldnote/comments/1x9abcd/hello_world/");
  assert.equal(parseRedditResponse(JSON.stringify({ jquery: [[0, 1, "attr", "find"]] }), reply), null);
});

test("Hacker News: the latest submission and the submit requests", () => {
  assert.equal(latestHnItem({ submitted: [501, 400] }), 501);
  assert.equal(latestHnItem({}), null);
  assert.equal(sites.hackernews.isSubmit("https://news.ycombinator.com/comment", "POST"), true);
  assert.equal(sites.hackernews.isSubmit("https://news.ycombinator.com/r", "POST"), true);
  assert.equal(sites.hackernews.isSubmit("https://news.ycombinator.com/item?id=1", "GET"), false);
  assert.equal(sites.reddit.isSubmit("https://old.reddit.com/api/comment", "POST"), true);
  assert.equal(sites.x.isSubmit("https://x.com/i/api/graphql/abc123/CreateTweet", "POST"), true);
  assert.equal(sites.x.isSubmit("https://x.com/i/api/graphql/abc123/FavoriteTweet", "POST"), false);
});

test("the text the user finally submitted is read from the site's request", () => {
  assert.equal(formText(new URLSearchParams({ parent: "1", text: "edited on the page" }).toString()), "edited on the page");
  assert.equal(formText("thing_id=t1_x&text="), null);
  assert.equal(xText(JSON.stringify({ variables: { tweet_text: "edited", reply: { in_reply_to_tweet_id: "1" } } })), "edited");
  assert.equal(xText("{}"), null);
  assert.equal(sites.x.tracked, false);
  assert.equal(sites.reddit.tracked && sites.hackernews.tracked, true);
});

test("LinkedIn: comment permalinks and new share links", () => {
  const comment = JSON.stringify({ data: { entityUrn: "urn:li:fsd_normComment:urn:li:fsd_comment:(7123,urn:li:activity:7000)" } });
  assert.equal(parseLinkedInResponse(comment, { mode: "reply" }), `https://www.linkedin.com/feed/update/urn:li:activity:7000/?commentUrn=${encodeURIComponent("urn:li:comment:(activity:7000,7123)")}`);
  const share = JSON.stringify({ data: { data: { createContentcreationDashShares: { resourceKey: "urn:li:fsd_share:urn:li:share:7555" } } } });
  assert.equal(parseLinkedInResponse(share, { mode: "post" }), "https://www.linkedin.com/feed/update/urn:li:share:7555/");
  assert.equal(sites.linkedin.isSubmit("https://www.linkedin.com/voyager/api/voyagerSocialDashNormComments?decorationId=x", "POST"), true);
  assert.equal(sites.linkedin.postedText(JSON.stringify({ commentary: { text: "edited" }, threadUrn: "urn:li:activity:1" })), "edited");
});

test("Bluesky: only posts count, and the link comes from the new record's URI", () => {
  const post = JSON.stringify({ repo: "did:plc:me", collection: "app.bsky.feed.post", record: { text: "hello", reply: {} } });
  const like = JSON.stringify({ repo: "did:plc:me", collection: "app.bsky.feed.like", record: {} });
  assert.equal(isBlueskyPost(post), true);
  assert.equal(isBlueskyPost(like), false);
  assert.equal(sites.bluesky.isSubmit("https://morel.us-east.host.bsky.network/xrpc/com.atproto.repo.createRecord", "POST", like), false);
  assert.equal(sites.bluesky.isSubmit("https://morel.us-east.host.bsky.network/xrpc/com.atproto.repo.createRecord", "POST", post), true);
  assert.equal(sites.bluesky.postedText(post), "hello");
  assert.equal(parseBlueskyResponse(JSON.stringify({ uri: "at://did:plc:me/app.bsky.feed.post/3abc", cid: "x" })), "https://bsky.app/profile/did:plc:me/post/3abc");
  assert.equal(parseBlueskyResponse(JSON.stringify({ results: [{ uri: "at://did:plc:me/app.bsky.feed.post/3def" }] })), "https://bsky.app/profile/did:plc:me/post/3def");
});

test("Mastodon and Discourse: links from the create responses; held posts have none yet", () => {
  assert.equal(parseMastodonResponse(JSON.stringify({ id: "1", url: "https://mastodon.social/@me/1" })), "https://mastodon.social/@me/1");
  assert.equal(sites.mastodon.postedText(JSON.stringify({ status: "@a@b.c edited", in_reply_to_id: "9" })), "@a@b.c edited");
  assert.deepEqual(sites.mastodon.hosts({ openUrl: "https://fosstodon.org/authorize_interaction?uri=x" }), ["fosstodon.org"]);
  const req = { openUrl: "https://forum.example.com/t/a/12" };
  assert.deepEqual(parseDiscourseResponse(JSON.stringify({ action: "create_post", post: { post_url: "/t/a/12/5" }, success: true }), req), { url: "https://forum.example.com/t/a/12/5", pending: false });
  assert.deepEqual(parseDiscourseResponse(JSON.stringify({ action: "enqueued", pending_post: { id: 3 } }), req), { url: null, pending: true });
  assert.equal(sites.discourse.isSubmit("https://forum.example.com/community/posts", "POST"), true);
  assert.equal(sites.discourse.postedText(JSON.stringify({ raw: "my reply", topic_id: 12 })), "my reply");
});
