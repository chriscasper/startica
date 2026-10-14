---
title: Stripe
description: Create a read-only Stripe restricted key so Startica can track subscriptions, MRR, new subscriptions and cancellations.
layout: doc
---

If your product sells subscriptions through Stripe, Startica can track revenue next to traffic and community numbers. It uses a **restricted key** you create with read-only permissions. Startica polls Stripe once a day; it doesn't use webhooks, because Stripe can't reach an app running on your own computer.

The key is per product. Each product can use a different Stripe account.

## What the key needs

Startica makes one kind of request: it lists all subscriptions (every status) with their prices expanded. It never creates, changes or deletes anything.

| Resource | Permission | Why |
| --- | --- | --- |
| Subscriptions | **Read** | Listing subscriptions. Required. |
| Prices | **Read** | Reading each subscription item's price and billing interval |
| Customers | **Read** | Recommended by the in-app instructions |
| Invoices | **Read** | Recommended by the in-app instructions |
| Everything else | **None** | Not used |

The in-app steps ask for Read on Customers, Subscriptions, Prices and Invoices. The current version only calls the subscriptions list, so Subscriptions and Prices are the minimum. Granting all four read permissions keeps the key working if a later version reads customers or invoices. All of these are read-only either way.

> [!WARNING]
> Startica also accepts a full secret key (`sk_live_…`), but don't use one. A secret key can move money and change your account. A restricted key with read permissions can't.

## Create the restricted key

1. In Startica, open **Settings → Products → Connections for …** with the right product active. On the **Stripe** row, click **Connect**, then the **Create restricted key** link in the dialog. This opens `dashboard.stripe.com/apikeys/create` in your browser. Alternatively, go to the Stripe Dashboard **Developers → API keys** and click **Create restricted key**.
2. Make sure you're in the right Stripe account, and in live mode (or a sandbox, for testing).
3. If Stripe asks how you'll use the key, choose to create it yourself with custom permissions, starting from no permissions.
4. **Key name:** `Startica`.
5. Set **Read** for Subscriptions and Prices, and for Customers and Invoices if you follow the in-app recommendation. Leave everything else at **None**.
6. Click **Create key**, and complete the verification Stripe sends you.
7. Copy the key. It starts with `rk_live_` (or `rk_test_` in a sandbox). Stripe shows it only once.

## Enter it in Startica

1. On the **Stripe** row, click **Connect**. If a key is already saved, the button reads **Replace key**.
2. Paste the key into **Restricted key** and click **Save and test**.

Startica stores the key encrypted (see [how credentials are stored](/credentials/#how-credentials-are-stored)) and syncs right away. The row shows **Connected** and **Last synced**, or **Error** with Stripe's message. A key that doesn't start with `rk_` or `sk_` plus `live_` or `test_` is rejected with "That doesn't look like a Stripe key".

## What Startica computes

| Metric | Meaning | History |
| --- | --- | --- |
| `active_subscriptions` | Subscriptions with status `active`, `trialing` or `past_due` | One value per sync day. History builds up from the day you connect. |
| `mrr` | Monthly recurring revenue of those subscriptions, in your currency's main unit (dollars, not cents) | One value per sync day, same as above |
| `new_subscriptions` | Subscriptions created on each day | Last 30 days, recomputed each sync |
| `cancellations` | Subscriptions whose `canceled_at` falls on each day | Last 30 days, recomputed each sync |

How MRR is calculated for each subscription item: unit price × quantity, converted to a monthly amount (a yearly price is divided by 12, a weekly one multiplied by 52/12, a daily one by 365/12, taking the interval count into account), then summed.

Limits of that calculation:

- Discounts, coupons and taxes aren't applied.
- Prices without a fixed unit amount, such as tiered or some usage-based prices, are skipped.
- Amounts in different currencies are added together without conversion. If you bill in several currencies, treat `mrr` as approximate.
- Plan mix (revenue per plan) isn't computed in the current version.

Days are calendar days in UTC.

## When it syncs

- Every day at 08:15 local time, while Startica is open.
- Right after you save a key (**Save and test**).
- When you click **Sync now** under the connections.

Each sync pages through your full subscription list, so a large Stripe account takes a little longer. No webhooks are involved, and nothing in Stripe needs to point at your computer.

## Rotate or remove the key

- To rotate: create a new restricted key, paste it with **Replace key**, then delete or expire the old key on the Stripe Dashboard's API keys page (the **⋯** menu next to the key).
- To remove: click the trash icon on the **Stripe** row. This deletes the stored key from Startica. Delete the key in Stripe as well.

Stored metric values stay in your local database after you remove the key.
