import { channels, contentChannels } from "@startica/db/schema";

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

/** Select options for where a community lives. */
export const channelOptions = channels.map((value) => ({ value, label: channelLabel(value) }));

/** Select options for what Content Studio can write for. */
export const contentChannelOptions = contentChannels.map((value) => ({ value, label: channelLabel(value) }));
