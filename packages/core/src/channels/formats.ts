/**
 * Community formats for channels whose communities are addresses rather than names.
 * No dependencies, so the UI can use them too.
 */

const DEFAULT_MASTODON_SERVER = "mastodon.social";

/** "#photography@mastodon.social", "photography", or a https://server/tags/photography link → tag and server. */
export function parseTagCommunity(name: string, url: string | null = null): { tag: string; server: string } | null {
  const fromUrl = url ? /^https?:\/\/([^/]+)\/tags\/([^/?#]+)/i.exec(url) : null;
  if (fromUrl) return { server: fromUrl[1]!.toLowerCase(), tag: decodeURIComponent(fromUrl[2]!) };
  const m = /^#?([\p{L}\p{N}_]+)(?:@([a-z0-9.-]+\.[a-z]{2,}))?$/iu.exec(name.trim());
  return m ? { tag: m[1]!, server: (m[2] ?? DEFAULT_MASTODON_SERVER).toLowerCase() } : null;
}

/** The forum's base URL from a community's URL/name or any forum link (keeps a sub-folder like /forum). */
export function forumBase(value: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!u.hostname.includes(".")) return null;
    const path = u.pathname.replace(/\/(t|c|latest|top|new|search|tag|tags|u)(\/.*)?$/, "").replace(/\/$/, "");
    return `${u.origin}${path}`;
  } catch {
    return null;
  }
}

/** Why listening can't read a watched community, or null when it can. */
export function communityProblem(channel: string, name: string, url: string | null): string | null {
  if (channel === "discourse" && !forumBase(url ?? name)) return "Startica can't read this forum: add its address as the URL.";
  if (channel === "mastodon" && !parseTagCommunity(name, url)) return "Startica can't read this: write it as a hashtag on a server, e.g. #photography@mastodon.social.";
  return null;
}
