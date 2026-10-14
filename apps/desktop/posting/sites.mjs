// Per-site parts of assisted posting (ARCHITECTURE.md section 8.4): which hosts the posting
// window may show, the fixed fill-in script, and how a post the user submitted is
// recognized. Fill-ins run in an isolated world (they share the page's DOM, not its
// JavaScript) and never submit anything: the user presses the site's own button.

/**
 * Sign-in pages the posting window may show for any site ("Sign in with Google/GitHub…",
 * common on Discourse forums). A forum with its own single sign-on elsewhere can't
 * finish signing in here; the bar's fallbacks still work.
 */
export const SIGN_IN_HOSTS = ["accounts.google.com", "appleid.apple.com", "github.com", "gitlab.com", "discord.com", "login.microsoftonline.com", "login.live.com"];

// --- Fill-in scripts (stringified into the page; keep them self-contained) -----------

/* eslint-disable no-undef -- these run in the page */
const helpers = `
  const wait = async (selector, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const el = document.querySelector(selector);
      if (el) return el;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  };
  // Native setter + input event, so the page's own scripts see the change.
  const set = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const show = (el) => { el.scrollIntoView({ block: "center" }); el.focus(); };
`;

function hackerNewsFill(req) {
  return async () => {
    const me = document.querySelector("a#me")?.textContent?.trim() || null;
    if (!me) return { ok: false, reason: "signed-out", me };
    if (req.mode === "reply") {
      const box = await wait('form[action="comment"] textarea[name="text"]');
      if (!box) return { ok: false, reason: "no-box", me };
      set(box, req.text);
      show(box);
      return { ok: true, me };
    }
    const title = await wait('form[action="/r"] input[name="title"]');
    if (!title) return { ok: false, reason: "no-box", me };
    set(title, req.title ?? "");
    const url = document.querySelector('form[action="/r"] input[name="url"]');
    if (url && req.link) set(url, req.link);
    const text = document.querySelector('form[action="/r"] textarea[name="text"]');
    if (text && req.text) set(text, req.text);
    show(title);
    return { ok: true, me };
  };
}

function redditFill(req) {
  return async () => {
    // old.reddit.com marks signed-in pages with body.loggedin.
    if (!document.body.classList.contains("loggedin")) return { ok: false, reason: "signed-out", me: null };
    if (req.mode === "post") {
      const title = await wait('textarea[name="title"], input[name="title"]');
      const text = document.querySelector('textarea[name="text"]');
      if (!title || !text) return { ok: false, reason: "no-box", me: null };
      set(title, req.title ?? "");
      set(text, req.text);
      const sub = document.querySelector('input[name="sr"]');
      if (sub && !sub.value) show(sub);
      else show(title);
      return { ok: true, me: null };
    }
    if (req.replyToComment) {
      // A comment's reply box appears under it after its "reply" link is clicked
      // (that only opens the box; nothing is sent).
      const thing = await wait(`.thing.id-t1_${req.replyToComment}`);
      if (!thing) return { ok: false, reason: "no-box", me: null };
      const own = () => thing.querySelector(":scope > .child form.usertext textarea[name='text']");
      if (!own()) thing.querySelector(":scope > .entry a[data-event-action='comment']")?.click();
      const end = Date.now() + 5000;
      while (!own() && Date.now() < end) await new Promise((r) => setTimeout(r, 150));
      const box = own();
      if (!box) return { ok: false, reason: "no-box", me: null };
      set(box, req.text);
      show(box);
      return { ok: true, me: null };
    }
    const box = await wait(".commentarea > form.usertext textarea[name='text']");
    if (!box) return { ok: false, reason: "no-box", me: null };
    set(box, req.text);
    show(box);
    return { ok: true, me: null };
  };
}

function xFill() {
  // The intent link pre-fills the composer itself; nothing to inject. A login page
  // means the user has to sign in first (then "Fill in again" reloads the intent).
  return async () => {
    if (/\/(i\/flow\/)?login/.test(location.pathname)) return { ok: false, reason: "signed-out", me: null };
    return { ok: true, me: null };
  };
}
/* eslint-enable no-undef */

// Rich-text editors (LinkedIn, Bluesky, Discourse's rich mode) ignore text set from a
// script; for those the fill-in only focuses the editor and returns insert: true, and
// the window types the text in through Electron's insertText (trusted input).
const focusEnd = `
  const focusEditor = (el) => {
    el.scrollIntoView({ block: "center" });
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const isEmpty = (el) => !(el.innerText || "").trim();
`;

function linkedinFill(req) {
  return async () => {
    if (/^\/(login|checkpoint|uas|authwall|signup)/.test(location.pathname)) return { ok: false, reason: "signed-out", me: null };
    const editorIn = (root) => root?.querySelector('[contenteditable="true"][role="textbox"], .ql-editor[contenteditable="true"], .ProseMirror[contenteditable="true"]');
    if (req.mode === "post") {
      // shareActive=true&text= opens the composer with the text already in it.
      const end = Date.now() + 10000;
      let editor = null;
      while (!editor && Date.now() < end) {
        editor = editorIn(document.querySelector('[role="dialog"]')) ?? editorIn(document.querySelector(".share-box, .share-creation-state"));
        if (!editor) await new Promise((r) => setTimeout(r, 200));
      }
      if (!editor) return { ok: false, reason: "no-box", me: null };
      if (isEmpty(editor)) {
        focusEditor(editor);
        return { ok: true, insert: true, me: null };
      }
      return { ok: true, me: null };
    }
    const area = await wait(".comments-comment-box, .comments-comment-texteditor, .comments-comment-box-comment__text-editor, form.comments-comment-box__form");
    let editor = editorIn(area) ?? editorIn(document.querySelector(".comments-comments-list")?.parentElement);
    if (!editor) {
      document.querySelector("button.comment-button, button[aria-label^='Comment'], button[data-control-name='comment']")?.click();
      editor = editorIn(await wait(".comments-comment-box, .comments-comment-texteditor", 5000));
    }
    if (!editor) return { ok: false, reason: "no-box", me: null };
    focusEditor(editor);
    return isEmpty(editor) ? { ok: true, insert: true, me: null } : { ok: true, me: null };
  };
}

function blueskyFill(req) {
  return async () => {
    const composer = () => document.querySelector('[data-testid="composePostView"] [contenteditable="true"], [data-testid="composePostView"] .ProseMirror');
    if (req.mode === "reply") {
      // The thread page's reply prompt (or the post's reply button) opens the composer; it only opens it.
      const button = (await wait('[data-testid="replyPromptBtn"], [data-testid="replyBtn"]', 10000));
      if (!button) return { ok: false, reason: document.querySelector('[data-testid="signInButton"], a[href="/login"]') ? "signed-out" : "no-box", me: null };
      if (!composer()) button.click();
    }
    const end = Date.now() + 8000;
    while (!composer() && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
    const editor = composer();
    if (!editor) return { ok: false, reason: document.querySelector('[data-testid="signInButton"]') ? "signed-out" : "no-box", me: null };
    focusEditor(editor);
    // The compose intent fills new posts itself; replies get the text typed in.
    return isEmpty(editor) ? { ok: true, insert: true, me: null } : { ok: true, me: null };
  };
}

function mastodonFill(req) {
  return async () => {
    if (/^\/auth\//.test(location.pathname)) return { ok: false, reason: "signed-out", me: null };
    const box = () => document.querySelector(".compose-form textarea, textarea.autosuggest-textarea__textarea");
    if (req.mode === "reply") {
      // authorize_interaction lands on the post in the user's own server; its first action is Reply.
      const reply = await wait(".detailed-status__action-bar button, .detailed-status__action-bar .icon-button", 12000);
      if (!reply) return { ok: false, reason: "no-box", me: null };
      reply.click();
      const end = Date.now() + 5000;
      while (!box() && Date.now() < end) await new Promise((r) => setTimeout(r, 150));
    } else await wait(".compose-form textarea, textarea.autosuggest-textarea__textarea");
    const el = box();
    if (!el) return { ok: false, reason: "no-box", me: null };
    // A reply starts with "@author "; keep it in front of the text.
    if (req.mode === "reply" || !el.value.trim()) set(el, `${el.value.trim() ? `${el.value.trim()} ` : ""}${req.text}`);
    show(el);
    return { ok: true, me: null };
  };
}

function discourseFill(req) {
  return async () => {
    if (!document.querySelector("#current-user, .current-user, .header-dropdown-toggle.current-user")) {
      if (document.querySelector(".login-button, .sign-up-button")) return { ok: false, reason: "signed-out", me: null };
    }
    const editor = () => document.querySelector(".d-editor-input");
    if (req.mode === "reply" && !editor()) {
      const button = req.replyToComment
        ? await wait(`article#post_${req.replyToComment} button.reply, [data-post-number="${req.replyToComment}"] button.reply`)
        : await wait("#topic-footer-buttons button.create, .topic-footer-main-buttons button.create");
      if (!button) return { ok: false, reason: "no-box", me: null };
      button.click(); // opens the composer; nothing is sent
    }
    const end = Date.now() + 10000;
    while (!editor() && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
    const el = editor();
    if (!el) return { ok: false, reason: "no-box", me: null };
    if (el instanceof HTMLTextAreaElement) {
      if (!el.value.trim()) set(el, req.text);
      show(el);
      return { ok: true, me: null };
    }
    // The rich editor (ProseMirror): type the text in.
    focusEditor(el);
    return isEmpty(el) ? { ok: true, insert: true, me: null } : { ok: true, me: null };
  };
}

/** The JavaScript to run in the page's isolated world for a request. */
export function fillScript(site, req) {
  const factory = { hackernews: hackerNewsFill, reddit: redditFill, x: xFill, linkedin: linkedinFill, bluesky: blueskyFill, mastodon: mastodonFill, discourse: discourseFill }[site];
  // Each factory returns an async arrow function; its source is evaluated with req bound.
  return `(async () => { ${helpers} ${focusEnd} const req = ${JSON.stringify(req)}; return await (${factory(req).toString()})(); })()`;
}

// --- Recognizing the post ------------------------------------------------------------
// The posting window watches its own network traffic (Chrome DevTools Protocol) for
// the request the site's Submit button sends, and reads the new post's id from it.

const toWwwReddit = (url) => url.replace(/^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com/i, "https://www.reddit.com");

/** X: the GraphQL CreateTweet (or CreateNoteTweet for long posts) response holds the new post's id. */
export function parseXResponse(body) {
  try {
    const data = JSON.parse(body)?.data;
    const result = (data?.create_tweet ?? data?.notetweet_create)?.tweet_results?.result;
    const id = result?.rest_id ?? result?.tweet?.rest_id;
    return id ? `https://x.com/i/status/${id}` : null;
  } catch {
    return null;
  }
}

/** old.reddit.com: /api/comment returns the new comment's id; /api/submit redirects to the new post. */
export function parseRedditResponse(body, req) {
  if (req.mode === "post") {
    const url = /https?:\/\/(?:old\.|www\.)?reddit\.com\/r\/[^"\\\s]+\/comments\/[a-z0-9]+\/[^"\\\s]*/i.exec(body)?.[0];
    return url ? toWwwReddit(url) : null;
  }
  const id = /"id":\s*"t1_([a-z0-9]+)"/i.exec(body)?.[1];
  return id && req.threadUrl ? `${req.threadUrl}${id}/` : null;
}

/** The text the user finally submitted (they may have edited it on the page), from the submit request's form body. */
export function formText(postData) {
  try {
    const text = new URLSearchParams(postData ?? "").get("text");
    return text?.trim() ? text : null;
  } catch {
    return null;
  }
}

/** X: the submitted text is in the GraphQL request's variables. */
export function xText(postData) {
  try {
    const text = JSON.parse(postData ?? "")?.variables?.tweet_text;
    return typeof text === "string" && text.trim() ? text : null;
  } catch {
    return null;
  }
}

const json = (text) => {
  try {
    return JSON.parse(text ?? "");
  } catch {
    return null;
  }
};

/** The first string at `key` anywhere in a JSON value (sites nest their payloads differently). */
function find(value, key, depth = 0) {
  if (!value || typeof value !== "object" || depth > 8) return null;
  if (typeof value[key] === "string") return value[key];
  if (value[key] && typeof value[key] === "object" && typeof value[key].text === "string") return value[key].text;
  for (const child of Object.values(value)) {
    const hit = find(child, key, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** LinkedIn: a comment's id and its post from the comment response; a new post's share id. */
export function parseLinkedInResponse(body, req) {
  const comment = /fsd_comment:\((\d+),urn:li:activity:(\d+)\)/.exec(body);
  if (comment) {
    const urn = `urn:li:comment:(activity:${comment[2]},${comment[1]})`;
    return `https://www.linkedin.com/feed/update/urn:li:activity:${comment[2]}/?commentUrn=${encodeURIComponent(urn)}`;
  }
  const share = /urn:li:(share|ugcPost):(\d+)/.exec(body);
  if (share && req.mode === "post") return `https://www.linkedin.com/feed/update/urn:li:${share[1]}:${share[2]}/`;
  return null;
}

/** Bluesky: createRecord / applyWrites answer with the new post's at:// URI. */
export function parseBlueskyResponse(body) {
  const data = json(body);
  const uri = data?.uri ?? data?.results?.find?.((r) => typeof r?.uri === "string")?.uri;
  const m = typeof uri === "string" ? /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri) : null;
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : null;
}

/** Only a new post counts on Bluesky (likes and follows use the same endpoint). */
export function isBlueskyPost(postData) {
  const data = json(postData);
  return data?.collection === "app.bsky.feed.post" || Boolean(data?.writes?.some?.((w) => w?.collection === "app.bsky.feed.post"));
}

/** Mastodon: POST /api/v1/statuses answers with the new status. */
export function parseMastodonResponse(body) {
  const data = json(body);
  return typeof data?.url === "string" ? data.url : typeof data?.uri === "string" ? data.uri : null;
}

/** Discourse: POST /posts answers with the post (post_url is relative); a post held for approval has none yet. */
export function parseDiscourseResponse(body, req) {
  const data = json(body);
  if (!data) return null;
  if (data.action === "enqueued" || data.pending_post) return { url: null, pending: true };
  const path = data.post?.post_url ?? data.post_url;
  return typeof path === "string" ? { url: new URL(path, req.openUrl).toString(), pending: false } : null;
}

/** Hacker News answers a post with a redirect; the new item is the user's latest submission. */
export function latestHnItem(user) {
  const id = user?.submitted?.[0];
  return typeof id === "number" ? id : null;
}

const wrap = (url) => (url ? { url } : null);
const hostOf = (req) => [new URL(req.openUrl).hostname];

/**
 * Per site: hosts the window may show (a list, or from the request for sites on any
 * domain), the button the user presses, which request that button sends (isSubmit;
 * postData is its body), and how the new post's link is read (parse → { url } or null).
 * tracked: whether engagement_sync checks replies to it.
 */
export const sites = {
  hackernews: {
    hosts: ["news.ycombinator.com"],
    submitLabel: (req) => (req.mode === "reply" ? "reply" : "submit"),
    isSubmit: (url, method) => method === "POST" && /^\/(comment|r)$/.test(new URL(url).pathname),
    // Success is a redirect; the id comes from the HN API (see window.mjs).
    result: "redirect",
    postedText: formText,
    // Startica checks replies to HN and Reddit posts (engagement_sync); not X.
    tracked: true,
  },
  reddit: {
    hosts: ["old.reddit.com", "www.reddit.com", "reddit.com", "redditstatic.com", "www.redditstatic.com"],
    submitLabel: (req) => (req.mode === "reply" ? "save" : "submit"),
    isSubmit: (url, method) => method === "POST" && /\/api\/(comment|submit)\/?$/.test(new URL(url).pathname),
    result: "body",
    parse: (body, req) => wrap(parseRedditResponse(body, req)),
    postedText: formText,
    tracked: true,
  },
  x: {
    hosts: ["x.com", "twitter.com", "api.x.com", "mobile.x.com"],
    submitLabel: (req) => (req.mode === "reply" ? "Reply" : "Post"),
    isSubmit: (url, method) => method === "POST" && /\/graphql\/[^/]+\/Create(Note)?Tweet$/.test(new URL(url).pathname),
    result: "body",
    parse: (body) => wrap(parseXResponse(body)),
    postedText: xText,
    tracked: false,
  },
  linkedin: {
    hosts: ["www.linkedin.com", "linkedin.com"],
    submitLabel: (req) => (req.mode === "reply" ? "Comment" : "Post"),
    isSubmit: (url, method) => method === "POST" && /\/voyager\/api\/(voyagerSocialDashNormComments|graphql\?.*ContentcreationDashShares|contentcreation\/normShares)/.test(url),
    result: "body",
    parse: (body, req) => wrap(parseLinkedInResponse(body, req)),
    postedText: (postData) => find(json(postData), "commentary"),
    tracked: false,
  },
  bluesky: {
    hosts: ["bsky.app", "bsky.social"],
    submitLabel: (req) => (req.mode === "reply" ? "Reply" : "Post"),
    isSubmit: (url, method, postData) => method === "POST" && /\/xrpc\/com\.atproto\.repo\.(createRecord|applyWrites)$/.test(new URL(url).pathname) && isBlueskyPost(postData),
    needsBody: true,
    result: "body",
    parse: (body) => wrap(parseBlueskyResponse(body)),
    postedText: (postData) => find(json(postData), "text"),
    tracked: true,
  },
  mastodon: {
    hosts: hostOf, // the user's own server
    submitLabel: (req) => (req.mode === "reply" ? "Reply" : "Post"),
    isSubmit: (url, method) => method === "POST" && /\/api\/v1\/statuses\/?$/.test(new URL(url).pathname),
    result: "body",
    parse: (body) => wrap(parseMastodonResponse(body)),
    postedText: (postData) => {
      const data = json(postData);
      return typeof data?.status === "string" ? data.status : new URLSearchParams(postData ?? "").get("status");
    },
    tracked: true,
  },
  discourse: {
    hosts: hostOf, // the forum
    submitLabel: (req) => (req.mode === "reply" ? "Reply" : "Create Topic"),
    isSubmit: (url, method) => method === "POST" && /\/posts(\.json)?\/?$/.test(new URL(url).pathname),
    result: "body",
    parse: parseDiscourseResponse,
    postedText: (postData) => {
      const data = json(postData);
      return typeof data?.raw === "string" ? data.raw : new URLSearchParams(postData ?? "").get("raw");
    },
    tracked: true,
  },
};
