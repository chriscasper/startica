---
title: Stripe
description: Create a read-only Stripe restricted key so Startica can track subscriptions, MRR, trials, new subscriptions, cancellations and revenue paid.
layout: doc
---

If your product sells subscriptions through Stripe, Startica can track revenue next to traffic and community numbers. It uses a **restricted key** you create with read-only permissions. Startica polls Stripe once a day; it doesn't use webhooks, because Stripe can't reach an app running on your own computer.

The key is per product. Each product can use a different Stripe account.

## What the key needs

Startica makes two kinds of request: it lists all subscriptions (every status) with their prices expanded, and it lists paid invoices. It never creates, changes or deletes anything.

| Resource | Permission | Why |
| --- | --- | --- |
| Subscriptions | **Read** | Listing subscriptions. Required. |
| Prices | **Read** | Reading each subscription item's price and billing interval |
| Customers | **Read** | Recommended by the in-app instructions |
| Invoices | **Read** | Listing paid invoices for **Revenue paid**. Without it, everything else still syncs. |
| Everything else | **None** | Not used |

The in-app steps ask for Read on Customers, Subscriptions, Prices and Invoices. Subscriptions and Prices are the minimum. Without Invoices, the sync still works, but the **Revenue paid** tile on Analytics says "Needs read access to invoices on the Stripe key". A key made before Startica read invoices may lack it: edit the key in Stripe to add Read on Invoices, or create a new one. All of these are read-only either way.

> [!WARNING]
> Startica also accepts a full secret key (`sk_live_…`), but don't use one. A secret key can move money and change your account. A restricted key with read permissions can't.

## Create the restricted key

1. In Startica, open **Settings → Products → Connections for …** with the right product active. On the **Stripe** row, click **Connect**, then the **Create restricted key** link in the dialog. This opens `dashboard.stripe.com/apikeys/create` in your browser. Alternatively, go to the Stripe Dashboard **Developers → API keys** and click **Create restricted key**.
2. Make sure you're in the right Stripe account, and in live mode (or a sandbox, for testing).
3. If Stripe asks how you'll use the key, choose to create it yourself with custom permissions, starting from no permissions.
4. **Key name:** `Startica`.
5. Set **Read** for Subscriptions, Prices and Invoices, and for Customers if you follow the in-app recommendation. Leave everything else at **None**.
6. Click **Create key**, and complete the verification Stripe sends you.
7. Copy the key. It starts with `rk_live_` (or `rk_test_` in a sandbox). Stripe shows it only once.

## Enter it in Startica

1. On the **Stripe** row, click **Connect**. If a key is already saved, the button reads **Replace key**.
2. Paste the key into **Restricted key** and click **Save and test**.

Startica stores the key encrypted (see [how credentials are stored](/credentials/#how-credentials-are-stored)) and syncs right away. The row shows **Connected** and **Last synced**, or **Error** with Stripe's message. A key that doesn't start with `rk_` or `sk_` plus `live_` or `test_` is rejected with "That doesn't look like a Stripe key".

## What Startica computes

Startica rebuilds each day's numbers from every subscription's start and end dates, so the charts on [Analytics](/guides/analytics#revenue) have history from the first sync, as far back as the product's [analytics history](/guides/analytics#history) (90 days by default). Each sync recomputes the whole history.

| Metric | Meaning |
| --- | --- |
| `active_subscriptions` | Subscriptions with status `active`, `trialing` or `past_due` at the end of each day. Today's value uses each subscription's current status. |
| `trials` | Those subscriptions that were in their trial on that day |
| `mrr` | Monthly recurring revenue of the active subscriptions, in your currency's main unit (dollars, not cents) |
| `new_subscriptions` | Subscriptions that started on each day |
| `cancellations` | Subscriptions whose `canceled_at` falls on each day: the day the customer canceled, which can be before the subscription ends |
| `mrr_new` | MRR of the subscriptions that started on each day |
| `mrr_churned` | MRR of the subscriptions that ended on each day (by `ended_at`) |
| `revenue` | `amount_paid` of the invoices paid on each day. Needs Read on Invoices. |

Subscriptions that never started (status `incomplete` or `incomplete_expired`, a first payment that failed or expired) are left out of every metric.

How MRR is calculated for each subscription item: unit price × quantity, converted to a monthly amount (a yearly price is divided by 12, a weekly one multiplied by 52/12, a daily one by 365/12, taking the interval count into account), then summed.

Limits of that calculation:

- Discounts, coupons and taxes aren't applied.
- Prices without a fixed unit amount, such as tiered or some usage-based prices, are skipped.
- Amounts in different currencies are added together without conversion. If you bill in several currencies, treat `mrr` as approximate.
- MRR uses each subscription's current price, also for past days. An upgrade or downgrade shows from today, not from the day it happened, and isn't split out in **MRR movement**.
- Plan mix (revenue per plan) isn't computed in the current version.

Days are calendar days in UTC.

## When it syncs

- Every day at 08:15 local time, while Startica is open.
- Right after you save a key (**Save and test**).
- When you click **Sync now** under the connections.

Each sync pages through your full subscription list and the paid invoices in the history, so a large Stripe account takes a little longer. No webhooks are involved, and nothing in Stripe needs to point at your computer.

## Rotate or remove the key

- To rotate: create a new restricted key, paste it with **Replace key**, then delete or expire the old key on the Stripe Dashboard's API keys page (the **⋯** menu next to the key).
- To remove: click the trash icon on the **Stripe** row. This deletes the stored key from Startica. Delete the key in Stripe as well.

Stored metric values stay in your local database after you remove the key.
