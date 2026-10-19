import { channelLabel } from "@startica/core/channels/labels";
import { channels, contentChannels } from "@startica/db/schema";

export { channelLabel, channelLabels } from "@startica/core/channels/labels";

/** Select options for where a community lives. */
export const channelOptions = channels.map((value) => ({ value, label: channelLabel(value) }));

/** Select options for what Content Studio can write for. */
export const contentChannelOptions = contentChannels.map((value) => ({ value, label: channelLabel(value) }));
