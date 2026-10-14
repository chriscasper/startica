import { describe, expect, it } from "vitest";
import { formatCampaign, parseCampaign } from "./campaign.ts";

const emails = [
  { subject: "Welcome to Fieldnote", preview: "Here's how to start", send_day: 0, body: "Hi there,\n\nThanks for joining.\n\n- Step one\n- Step two" },
  { subject: "One tip", preview: "", send_day: 3.4, body: "Short one today." },
];

describe("email campaigns", () => {
  it("round-trips through the text sections", () => {
    const text = formatCampaign(emails);
    expect(text).toContain("## Email 2 · Day 3\nSubject: One tip");
    expect(parseCampaign(text)).toEqual([
      { sendDay: 0, subject: "Welcome to Fieldnote", preview: "Here's how to start", body: "Hi there,\n\nThanks for joining.\n\n- Step one\n- Step two" },
      { sendDay: 3, subject: "One tip", preview: "", body: "Short one today." },
    ]);
  });

  it("reads edits, and gives up on text that isn't a campaign", () => {
    const edited = formatCampaign(emails).replace("Subject: One tip", "Subject: One quick tip").replace("Day 3", "Day 4");
    expect(parseCampaign(edited)?.[1]).toMatchObject({ sendDay: 4, subject: "One quick tip" });
    expect(parseCampaign("Just a normal post.")).toBeNull();
  });
});
