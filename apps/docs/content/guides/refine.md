---
title: Refining AI suggestions
description: Chat with the AI about a suggestion (a reply draft, a post, an ad, a security or accessibility fix), apply the revision you want, and go back to any earlier version.
layout: doc
---

Many of Startica's AI suggestions have a **Refine** button. It opens a chat beside the page about that one suggestion. You can ask questions, push back, or describe your setup. When the AI changes the suggestion, the revised version appears under its reply with an **Apply** button. Nothing changes until you apply it. This page covers where Refine is, how the chat works, and **Versions**.

## Where you'll find it

| Suggestion | Where | Notes |
|---|---|---|
| Reply drafts | [Inbox](/guides/drafting-replies), on a drafted card | Applying adds a new draft version, like saving your own edits. |
| Content Studio pieces | [Content Studio](/guides/content-studio) → Library, on a piece that isn't posted | An email campaign is revised email by email. |
| Ad copy | [Ads](/ads/) → a campaign, next to each ad | Each revision gets the same checks as the ad editor, and any problems are listed under the reply. |
| Security fix steps | [Security](/security/), on a finding with **Help for your stack** | |
| Accessibility fixes | [Accessibility](/accessibility/ai-help), on an issue with a **Suggested fix** | |

Refine needs an AI key (Settings → General → AI) and is off in the [demo](/guides/demo-mode). On reply drafts and pieces, save or undo your own edits first: the chat works on the saved text.

## Chat about a suggestion

1. Click **Refine**. The chat opens in a panel on the right, and the page stays usable beside it.
2. Write a message, or pick one of the suggested starters (for example **Make it shorter and more casual** on a reply draft).
3. The reply appears as it's written. Click **Stop** to end it early; what it wrote so far stays. If a reply fails or you stop it, **Try again** asks again.
4. When the AI changes the suggestion, it says what it changed, and the complete revised version appears under its reply.
5. Click **Apply** to use it. The page shows the revision, and the chat ends. Your next message starts a new chat.

The AI sees the same information the suggestion was first written from (for a reply draft: the conversation, the community's self-promotion rules and your recent replies there) and the suggestion as it is now. It follows the same rules as when it wrote it. For example, reply drafts still say plainly that you made the product when they mention it.

**Start over** ends the chat without applying anything. Earlier chats about the same suggestion stay readable from the panel's header.

### Web search

The AI can search the web, up to 3 times per reply, to check documentation, versions or configuration syntax. Replies list their sources. To turn web search off, clear the checkbox under the message box. The setting is remembered for every chat.

### Cost

Each reply is an AI call, listed with the others under **System → AI calls**. The panel shows what the open chat has cost so far. Your monthly AI budget applies as usual.

## Versions

Startica keeps every version of a suggestion: each one the AI wrote (including **Regenerate** and **Rewrite**), each one you saved yourself, and each revision you applied from a chat. When there are two or more, a **Versions** button appears next to the suggestion.

The list is newest first, and each version is marked **Suggested**, **Edited by you** or **From a chat**. **Show** displays it in full. **Restore** makes an earlier version the current one again. Nothing is deleted.

> [!NOTE]
> Versions start when this feature arrived. A suggestion written before then gets its first version the next time it changes.

For a reply draft, restoring adds the old text as a new draft version, so the card's version number goes up. A posted reply or piece can't change: Refine and **Restore** only work before you post.
