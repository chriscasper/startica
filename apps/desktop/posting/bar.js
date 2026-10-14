// The posting window's Startica bar: shows what's happening and offers the fallbacks.
const message = document.getElementById("message");
const linkForm = document.getElementById("link-form");
const link = document.getElementById("link");

const where = { reply: "reply", post: "post" };

function show(text, tone = "") {
  message.textContent = "";
  message.className = tone;
  // Bold the site's button name so it's easy to find on the page.
  const parts = text.split(/(“[^”]+”)/);
  for (const part of parts) {
    if (part.startsWith("“")) {
      const strong = document.createElement("strong");
      strong.textContent = part;
      message.append(strong);
    } else message.append(part);
  }
}

window.posting.onState((s) => {
  const thing = where[s.mode] ?? "post";
  linkForm.hidden = s.status !== "detect-failed";
  switch (s.status) {
    case "loading":
      return show("Opening the page…");
    case "filling":
      return show("Filling it in…");
    case "filled":
      return show(`Check your ${thing}, edit it if you like, then press “${s.button}” on the page. Startica never posts for you.`);
    case "signed-out":
      return show("Sign in on this page first (Startica remembers it), then click Fill in again.", "warn");
    case "no-box":
      return show(`Couldn't find where to fill it in. The text is on your clipboard: paste it, then press “${s.button}”.`, "warn");
    case "detecting":
      return show("Posted. Finding the link…", "ok");
    case "posted":
      return show("Posted. Saving it to Startica…", "ok");
    case "recorded":
      if (s.pending) return show("Saved to Startica. The forum shows it once a moderator approves it; add its link in Startica then.", "ok");
      return show(s.tracked ? "Saved to Startica. Replies to it will be tracked for two weeks." : "Saved to Startica.", "ok");
    case "detect-failed":
      link.focus();
      return show("Did it post? Paste the link to it to save it in Startica.", "warn");
    case "record-failed":
      return show(`Posted, but Startica couldn't save it: ${s.error ?? "unknown error"}. Mark it as posted in Startica.`, "warn");
  }
});

document.getElementById("fill").addEventListener("click", () => window.posting.fill());
document.getElementById("copy").addEventListener("click", () => {
  void window.posting.copy();
  show("Copied. Paste it on the page if the box is empty.");
});
document.getElementById("save").addEventListener("click", () => {
  linkForm.hidden = false;
  link.focus();
});
document.getElementById("close").addEventListener("click", () => window.posting.close());
linkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(await window.posting.saveLink(link.value))) show("That doesn't look like a link. Paste the full address, starting with https://", "warn");
});
