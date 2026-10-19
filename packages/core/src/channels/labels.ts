/** Display names for conversation channels and Content Studio channels. */
export const channelLabels: Record<string, string> = {
  reddit: "Reddit",
  hackernews: "Hacker News",
  x: "X",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  mastodon: "Mastodon",
  bluesky: "Bluesky",
  discourse: "Discourse",
  blog: "Blog",
  newsletter: "Newsletter",
  email: "Email",
  other: "Other",
};

export const channelLabel = (value: string) => channelLabels[value] ?? value;
