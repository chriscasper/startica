// Local stand-ins for Hacker News, old.reddit.com and X's intent composer, used by the
// desktop smoke test to exercise assisted posting end to end without touching the real
// sites. They mimic the markup the fill-in scripts look for and each site's response
// to a submit. `posts` counts submissions, so the test can prove nothing was sent
// before the (simulated) user pressed the button.
import { createServer } from "node:http";

const page = (body, { loggedIn = true, bodyClass = "" } = {}) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>stand-in</title></head><body class="${bodyClass}${loggedIn ? " loggedin" : ""}">${body}</body></html>`;

export function startStandins(port) {
  const posts = { hackernews: 0, reddit: 0, x: 0, linkedin: 0, bluesky: 0, mastodon: 0, discourse: 0 };
  let hnLatest = 4000;

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const send = (status, body, type = "text/html") => {
      res.writeHead(status, { "content-type": type });
      res.end(body);
    };
    const drain = (fn) => {
      req.resume();
      req.on("end", fn);
    };

    // --- Hacker News ---------------------------------------------------------------
    if (url.pathname === "/item") {
      return send(200, page(`<a id="me" href="user?id=tester">tester</a><form action="comment" method="post"><input type="hidden" name="parent" value="${url.searchParams.get("id")}"><textarea name="text"></textarea><input type="submit" value="reply"></form>`));
    }
    if (url.pathname === "/comment" && req.method === "POST") {
      return drain(() => {
        posts.hackernews++;
        hnLatest = 9001;
        res.writeHead(302, { location: "/item?id=4242" });
        res.end();
      });
    }
    if (url.pathname === "/submit") {
      return send(200, page(`<a id="me" href="user?id=tester">tester</a><form action="/r" method="post"><input name="title"><input name="url"><textarea name="text"></textarea><input type="submit" value="submit"></form>`));
    }
    if (url.pathname === "/r" && req.method === "POST") {
      return drain(() => {
        posts.hackernews++;
        hnLatest = 9002;
        res.writeHead(302, { location: "/newest" });
        res.end();
      });
    }
    if (url.pathname === "/newest") return send(200, page("<p>new</p>"));
    if (url.pathname === "/hn-api/user/tester.json") return send(200, JSON.stringify({ id: "tester", submitted: [hnLatest, 12] }), "application/json");

    // --- old.reddit.com --------------------------------------------------------------
    if (url.pathname.startsWith("/r/test/comments/abc123/")) {
      // The comment's reply box appears when its "reply" link is clicked, as on old Reddit.
      return send(
        200,
        page(
          `<div class="commentarea"><form class="usertext"><textarea name="text"></textarea></form>
           <div class="thing id-t1_c0mm3nt"><div class="entry"><p>the comment</p><ul class="flat-list buttons"><li><a href="#" data-event-action="comment">reply</a></li></ul></div><div class="child"></div></div></div>
           <script>
             document.querySelector("a[data-event-action=comment]").addEventListener("click", (e) => {
               e.preventDefault();
               document.querySelector(".thing.id-t1_c0mm3nt > .child").innerHTML = '<form class="usertext"><textarea name="text"></textarea><button type="button" class="save">save</button></form>';
               document.querySelector(".child .save").addEventListener("click", () => fetch("/api/comment", { method: "POST", body: new URLSearchParams({ thing_id: "t1_c0mm3nt", text: document.querySelector(".child textarea").value }) }));
             });
           </script>`,
        ),
      );
    }
    if (url.pathname === "/api/comment" && req.method === "POST") {
      return drain(() => {
        posts.reddit++;
        send(200, JSON.stringify({ jquery: [[0, 1, "call", [[{ kind: "t1", data: { id: "t1_newc0m", parent: "t1_c0mm3nt", link: "t3_abc123" } }]]]] }), "application/json");
      });
    }

    // --- X intent composer ---------------------------------------------------------
    if (url.pathname === "/intent/tweet") {
      return send(
        200,
        page(
          `<textarea id="composer"></textarea><button id="post" type="button">Reply</button>
           <script>
             const p = new URLSearchParams(location.search);
             document.getElementById("composer").value = p.get("text") || "";
             document.getElementById("post").addEventListener("click", () => fetch("/i/api/graphql/abc123/CreateTweet", { method: "POST", body: JSON.stringify({ variables: { tweet_text: document.getElementById("composer").value, reply: { in_reply_to_tweet_id: p.get("in_reply_to") } } }) }));
           </script>`,
          { loggedIn: false },
        ),
      );
    }
    if (url.pathname === "/i/api/graphql/abc123/CreateTweet" && req.method === "POST") {
      return drain(() => {
        posts.x++;
        send(200, JSON.stringify({ data: { create_tweet: { tweet_results: { result: { rest_id: "1844999" } } } } }), "application/json");
      });
    }
    // --- LinkedIn (comment box is a rich-text editor) ------------------------------------
    if (url.pathname.startsWith("/feed/update/urn:li:activity:7000")) {
      return send(
        200,
        page(
          `<div class="comments-comment-box"><div contenteditable="true" role="textbox"></div><button id="comment" type="button">Comment</button></div>
           <script>
             document.getElementById("comment").addEventListener("click", () => fetch("/voyager/api/voyagerSocialDashNormComments?decorationId=x", { method: "POST", body: JSON.stringify({ commentary: { text: document.querySelector("[role=textbox]").innerText }, threadUrn: "urn:li:activity:7000" }) }));
           </script>`,
        ),
      );
    }
    if (url.pathname === "/voyager/api/voyagerSocialDashNormComments" && req.method === "POST") {
      return drain(() => {
        posts.linkedin++;
        send(201, JSON.stringify({ data: { entityUrn: "urn:li:fsd_normComment:urn:li:fsd_comment:(7123,urn:li:activity:7000)" } }), "application/json");
      });
    }

    // --- Bluesky (a like goes to the same endpoint and must not count) --------------------
    if (url.pathname.startsWith("/profile/")) {
      return send(
        200,
        page(
          `<button data-testid="replyBtn" type="button">reply</button><div id="slot"></div>
           <script>
             const create = (collection, record) => fetch("/xrpc/com.atproto.repo.createRecord", { method: "POST", body: JSON.stringify({ repo: "did:plc:me", collection, record }) });
             create("app.bsky.feed.like", { subject: {} }); // something else the page does on its own
             document.querySelector("[data-testid=replyBtn]").addEventListener("click", () => {
               document.getElementById("slot").innerHTML = '<div data-testid="composePostView"><div contenteditable="true"></div><button data-testid="composerPublishBtn" type="button">Reply</button></div>';
               document.querySelector("[data-testid=composerPublishBtn]").addEventListener("click", () => create("app.bsky.feed.post", { text: document.querySelector("[data-testid=composePostView] [contenteditable]").innerText, reply: {} }));
             });
           </script>`,
        ),
      );
    }
    if (url.pathname === "/xrpc/com.atproto.repo.createRecord" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      return req.on("end", () => {
        const isPost = JSON.parse(body).collection === "app.bsky.feed.post";
        if (isPost) posts.bluesky++;
        send(200, JSON.stringify({ uri: `at://did:plc:me/${isPost ? "app.bsky.feed.post/3new" : "app.bsky.feed.like/3like"}`, cid: "c" }), "application/json");
      });
    }

    // --- Mastodon (the user's own server) ----------------------------------------------------
    if (url.pathname === "/authorize_interaction") {
      res.writeHead(302, { location: "/@a@mastodon.world/555" });
      return res.end();
    }
    if (url.pathname === "/@a@mastodon.world/555") {
      return send(
        200,
        page(
          `<div class="detailed-status__action-bar"><button type="button" title="Reply">reply</button><button type="button">boost</button></div><div id="compose"></div>
           <script>
             document.querySelector(".detailed-status__action-bar button").addEventListener("click", () => {
               document.getElementById("compose").innerHTML = '<form class="compose-form"><textarea class="autosuggest-textarea__textarea"></textarea><div class="compose-form__submit"><button type="button">Reply</button></div></form>';
               document.querySelector(".compose-form textarea").value = "@a@mastodon.world ";
               document.querySelector(".compose-form__submit button").addEventListener("click", () => fetch("/api/v1/statuses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: document.querySelector(".compose-form textarea").value, in_reply_to_id: "555" }) }));
             });
           </script>`,
        ),
      );
    }
    if (url.pathname === "/api/v1/statuses" && req.method === "POST") {
      return drain(() => {
        posts.mastodon++;
        send(200, JSON.stringify({ id: "777", url: "https://mastodon.example/@me/777", uri: "https://mastodon.example/users/me/statuses/777" }), "application/json");
      });
    }

    // --- Discourse (rich-text composer) ---------------------------------------------------
    if (url.pathname === "/t/a-topic/12") {
      return send(
        200,
        page(
          `<a id="current-user" href="#">me</a><div id="topic-footer-buttons"><button class="create" type="button">Reply</button></div><div id="reply-control"></div>
           <script>
             document.querySelector("#topic-footer-buttons .create").addEventListener("click", () => {
               document.getElementById("reply-control").innerHTML = '<div class="d-editor-input ProseMirror" contenteditable="true"></div><button class="btn-primary create" id="send" type="button">Reply</button>';
               document.getElementById("send").addEventListener("click", () => fetch("/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: document.querySelector(".d-editor-input").innerText, topic_id: 12, nested_post: true }) }));
             });
           </script>`,
        ),
      );
    }
    if (url.pathname === "/new-topic") {
      // Discourse pre-fills the composer from the link itself.
      return send(
        200,
        page(
          `<a id="current-user" href="#">me</a><input id="reply-title" name="title"><textarea class="d-editor-input"></textarea><button id="create" type="button">Create Topic</button>
           <script>
             const p = new URLSearchParams(location.search);
             document.getElementById("reply-title").value = p.get("title") || "";
             document.querySelector(".d-editor-input").value = p.get("body") || "";
             document.getElementById("create").addEventListener("click", () => fetch("/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: document.getElementById("reply-title").value, raw: document.querySelector(".d-editor-input").value }) }));
           </script>`,
        ),
      );
    }
    if (url.pathname === "/posts" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      return req.on("end", () => {
        posts.discourse++;
        // New topics on this forum wait for a moderator; replies go straight up.
        if (JSON.parse(body).title) return send(200, JSON.stringify({ action: "enqueued", pending_post: { id: 5 } }), "application/json");
        send(200, JSON.stringify({ action: "create_post", post: { id: 90, post_url: "/t/a-topic/12/2" }, success: true }), "application/json");
      });
    }
    if (url.pathname === "/intent/compose") {
      // A compose page whose editor starts empty, so the text is typed in.
      return send(
        200,
        page(
          `<div data-testid="composePostView"><div contenteditable="true"></div><button data-testid="composerPublishBtn" type="button">Post</button></div>
           <script>
             document.querySelector("[data-testid=composerPublishBtn]").addEventListener("click", () => fetch("/xrpc/com.atproto.repo.createRecord", { method: "POST", body: JSON.stringify({ repo: "did:plc:me", collection: "app.bsky.feed.post", record: { text: document.querySelector("[contenteditable]").innerText } }) }));
           </script>`,
        ),
      );
    }

    send(404, "not found", "text/plain");
  });

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${port}`, posts, close: () => server.close() })));
}
